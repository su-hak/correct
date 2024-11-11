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
        this.logger.warn('No text annotations found');
        return this.getEmptyResult();
      }

      // 디버깅을 위한 전체 텍스트 출력
      this.logger.debug('Full text detected:', textAnnotations[0].description);

      // 개별 텍스트 블록들의 신뢰도 출력
      textAnnotations.slice(1).forEach((annotation, index) => {
        this.logger.debug(`Text block ${index}:`, {
          text: annotation.description,
          confidence: annotation.confidence || 0
        });
      });

      // 전체 텍스트를 줄 단위로 분리
      const lines = textAnnotations[0].description
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      this.logger.debug('Split lines:', lines);

      // 타이틀 라인 찾기 - 더 유연한 매칭
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

      this.logger.debug('Found title at index:', titleIndex);

      // 타이틀 이후 문장들 추출
      const candidateSentences = lines
        .slice(titleIndex + 1)
        .filter(line => this.isValidKoreanSentence(line));

      this.logger.debug('Candidate sentences:', candidateSentences);

      // 최대 5개의 문장 선택
      const validSentences = candidateSentences.slice(0, 5);

      if (validSentences.length === 0) {
        this.logger.warn('No valid sentences found after title');
        return this.getEmptyResult();
      }

      this.logger.debug('Valid sentences selected:', validSentences);

      // 문법 평가
      const grammarResult = await this.grammarService.findMostNaturalSentence(validSentences);

      // 바운딩 박스 찾기
      const boundingBoxes = validSentences.map(sentence => {
        const annotation = textAnnotations.slice(1).find(a => 
          a.description.trim() === sentence.trim()
        );
        return annotation?.boundingPoly?.vertices || [];
      });

      return {
        sentences: validSentences,
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