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
            }]
          }]
        }
      );

      const textAnnotations = response.data.responses[0]?.textAnnotations;
      if (!textAnnotations || textAnnotations.length === 0) {
        return this.getEmptyResult();
      }

      // 전체 텍스트를 한 번에 가져오기
      const fullText = textAnnotations[0].description;
      
      // 전체 텍스트를 줄 단위로 분리하고 각 줄의 신뢰도 점수 계산
      const lines = fullText.split('\n').map(line => ({
        text: line.trim(),
        confidence: this.calculateConfidence(line, textAnnotations.slice(1))
      }));

      // '올바른 문장을 선택해 주세요' 찾기
      const titleIndex = lines.findIndex(line => 
        line.text.includes('올바른 문장을 선택해 주세요') && 
        line.confidence >= 0.7
      );

      if (titleIndex === -1) {
        this.logger.warn('Title not found or confidence too low');
        return this.getEmptyResult();
      }

      // 타이틀 이후 5개의 유효한 문장 찾기
      const validSentences = lines
        .slice(titleIndex + 1)
        .filter(line => 
          line.text &&
          line.text.length >= 2 &&
          line.confidence >= 0.7 &&
          this.isValidKoreanSentence(line.text)
        )
        .slice(0, 5)
        .map(line => line.text);

      if (validSentences.length === 0) {
        this.logger.warn('No valid sentences found after title');
        return this.getEmptyResult();
      }

      // 문법 평가
      const grammarResult = await this.grammarService.findMostNaturalSentence(validSentences);

      // 관련 바운딩 박스 찾기
      const relevantBoxes = this.getRelevantBoundingBoxes(
        validSentences,
        textAnnotations.slice(1)
      );

      return {
        sentences: validSentences,
        boundingBoxes: relevantBoxes,
        correctIndex: grammarResult.correctIndex,
        correctSentence: grammarResult.correctSentence,
        sentenceScores: grammarResult.sentenceScores
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
      return this.getEmptyResult();
    }
  }

  private calculateConfidence(line: string, annotations: any[]): number {
    const matchingAnnotations = annotations.filter(a => 
      a.description.includes(line) || line.includes(a.description)
    );

    if (matchingAnnotations.length === 0) return 0;

    // 가장 높은 신뢰도 반환
    return Math.max(...matchingAnnotations.map(a => a.confidence || 0));
  }

  private getRelevantBoundingBoxes(sentences: string[], annotations: any[]): any[] {
    const boxes = [];
    for (const sentence of sentences) {
      const annotation = annotations.find(a => 
        a.description === sentence || 
        sentence.includes(a.description)
      );
      if (annotation?.boundingPoly?.vertices) {
        boxes.push(annotation.boundingPoly.vertices);
      }
    }
    return boxes;
  }

  private isValidKoreanSentence(text: string): boolean {
    return /[가-힣]/.test(text) && 
           !text.includes('올바른 문장을 선택해 주세요') &&
           text.length >= 2;
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