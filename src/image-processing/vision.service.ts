import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';
import { GrammarService } from 'src/grammar/grammar.service';

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
      // Vision API 요청 간소화
      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          requests: [{
            image: {
              content: imageBuffer.toString('base64')
            },
            features: [{
              type: 'TEXT_DETECTION'
            }]
          }]
        }
      );

      const textAnnotations = response.data.responses[0]?.textAnnotations || [];
      if (textAnnotations.length === 0) {
        return { sentences: [], boundingBoxes: [], correctIndex: -1, correctSentence: '', sentenceScores: [] };
      }

      // 문장 추출 최적화
      const sentences = textAnnotations[0].description
        .split('\n')
        .map(s => s.trim())
        .filter(s => /[가-힣]/.test(s) && !s.includes('올바른 문장을 선택해 주세요'))
        .slice(0, 5);

      if (sentences.length === 0) {
        return { sentences: [], boundingBoxes: [], correctIndex: -1, correctSentence: '', sentenceScores: [] };
      }

      // GPT 분석
      const { correctSentence, correctIndex, sentenceScores } = 
        await this.grammarService.findMostNaturalSentence(sentences);

      return {
        sentences,
        boundingBoxes: [],
        correctIndex,
        correctSentence,
        sentenceScores
      };
    } catch (error) {
      this.logger.error('Vision API error:', error);
      throw error;
    }
  }
}