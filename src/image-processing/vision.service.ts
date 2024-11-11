import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';
import { GrammarService } from 'src/grammar/grammar.service';
import * as https from 'https';

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly apiKey: string;

  constructor(
    private configService: ConfigService,
    private grammarService: GrammarService
  ) {
    this.apiKey = this.configService.get<string>('GOOGLE_CLOUD_API_KEY');
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<{
    sentences: string[];
    boundingBoxes: any[];
    correctIndex: number;
    correctSentence: string;
    sentenceScores: number[];
}> {
  try {
    const optimizedBuffer = await sharp(imageBuffer)
      .resize(1024, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    // 타이틀과 5개 문장을 모두 포함할 수 있도록 검사 영역 확장
    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
      {
        requests: [{
          image: {
            content: optimizedBuffer.toString('base64')
          },
          features: [{
            type: 'TEXT_DETECTION',
            model: 'builtin/latest'
          }],
          // 이미지 영역 지정 (상단 여백은 줄이고 하단 여백은 늘림)
          imageContext: {
            cropHintsParams: {
              aspectRatios: [0.8],  // 세로로 더 긴 영역
              confidenceThreshold: 0.3  // 낮은 confidence도 포함
            }
          }
        }]
      }
    );

    const textAnnotations = response.data.responses[0]?.textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      this.logger.warn('No text annotations found');
      return this.getEmptyResult();
    }

    // 전체 텍스트를 줄 단위로 분리
    const lines = textAnnotations[0].description
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // 타이틀 라인 찾기
    let titleIndex = -1;
    const titlePattern = /올바른\s*문장을?\s*선택해?\s*주세요/;
    
    for (let i = 0; i < lines.length; i++) {
      if (titlePattern.test(lines[i])) {
        titleIndex = i;
        break;
      }
    }

    if (titleIndex === -1) {
      this.logger.warn('Title pattern not found in text');
      return this.getEmptyResult();
    }

    // 타이틀 이후의 모든 문장 추출 (더 많은 문장 포함)
    const candidateSentences = lines
      .slice(titleIndex + 1)
      .filter(line => this.isValidKoreanSentence(line));

    this.logger.debug('Found candidate sentences:', candidateSentences);

    // 정확히 5개의 문장이 있는지 확인
    if (candidateSentences.length < 5) {
      this.logger.warn(`Only found ${candidateSentences.length} sentences, expected 5`);
    } else if (candidateSentences.length > 5) {
      this.logger.debug(`Found ${candidateSentences.length} sentences, trimming to 5`);
      candidateSentences.splice(5);
    }

    // 바운딩 박스 찾기 (좀 더 넓은 영역 포함)
    const boundingBoxes = candidateSentences.map(sentence => {
      const annotation = textAnnotations.slice(1).find(a => {
        // 좀 더 유연한 매칭을 위해 공백 제거하고 비교
        const annotationText = a.description.trim().replace(/\s+/g, '');
        const sentenceText = sentence.trim().replace(/\s+/g, '');
        return annotationText === sentenceText;
      });
      return annotation?.boundingPoly?.vertices || [];
    });

    // 문법 평가
    const grammarResult = await this.grammarService.findMostNaturalSentence(candidateSentences);

    return {
      sentences: candidateSentences,
      boundingBoxes,
      correctIndex: grammarResult.correctIndex,
      correctSentence: grammarResult.correctSentence,
      sentenceScores: grammarResult.sentenceScores
    };

  } catch (error) {
    this.logger.error('Vision API error:', error);
    return this.getEmptyResult();
  }
}

private isValidKoreanSentence(text: string): boolean {
  return Boolean(
    text && 
    text.trim() && 
    /[가-힣]/.test(text) && 
    !text.includes('올바른 문장을 선택해 주세요') &&
    text.length >= 2
  );
}

  private getEmptyResult() {
    return {
      sentences: [],
      boundingBoxes: [],
      correctIndex: -1,
      correctSentence: '',
      sentenceScores: []
    };
  }
}