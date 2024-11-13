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

  private isValidKoreanSentence(text: string): boolean {
    // 기본적인 검증만 수행
    return /[가-힣]/.test(text) && // 한글 포함
           !text.includes('올바른 문장을 선택해 주세요');
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<{
    sentences: string[];
    boundingBoxes: any[];
    correctIndex: number;
    correctSentence: string;
    sentenceScores: number[];
  }> {
    try {
      // 이미지 최적화
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

      // 문장 추출 및 간단한 필터링
      const sentences = textAnnotations[0].description
        .split('\n')
        .map(s => s.trim())
        .filter(s => s && this.isValidKoreanSentence(s));

      if (sentences.length === 0) {
        return this.getEmptyResult();
      }

      // 문법 평가
      const grammarResult = await this.grammarService.findMostNaturalSentence(sentences);

      return {
        sentences,
        boundingBoxes: textAnnotations.slice(1).map(t => t.boundingPoly?.vertices || []),
        correctIndex: grammarResult.correctIndex,
        correctSentence: grammarResult.correctSentence,
        sentenceScores: grammarResult.sentenceScores
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
      return this.getEmptyResult();
    }
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