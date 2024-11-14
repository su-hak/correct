import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';
import { GrammarService } from '../grammar/grammar.service';

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

  async detectTextInImage(imageBuffer: Buffer): Promise<any> {
    const totalStart = Date.now();
    try {
      // 이미지 최적화 시간
      const optimizeStart = Date.now();
      const optimizedBuffer = await sharp(imageBuffer)
        .resize(1024, null, { withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      this.logger.log(`Image optimization took: ${Date.now() - optimizeStart}ms`);

      // Vision API 요청 시간
      const apiStart = Date.now();
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
      this.logger.log(`Vision API call took: ${Date.now() - apiStart}ms`);

      // 텍스트 처리 시간
      const processStart = Date.now();
      const textAnnotations = response.data.responses[0]?.textAnnotations;

      if (!textAnnotations || textAnnotations.length === 0) {
        return {
          sentences: [],
          error: 'No text detected'
        };
      }

      const sentences = textAnnotations[0].description
        .split('\n')
        .map(s => s.trim())
        .filter(s => s && this.isValidKoreanSentence(s));
      this.logger.log(`Text processing took: ${Date.now() - processStart}ms`);

      this.logger.log(`Total Vision Service took: ${Date.now() - totalStart}ms`);
      return {
        sentences: sentences.slice(0, 5)
      };

    } catch (error) {
      this.logger.error(`Vision Service failed after ${Date.now() - totalStart}ms:`, error);
      return {
        sentences: [],
        error: 'Analysis failed'
      };
    }
  }

  private isValidKoreanSentence(text: string): boolean {
    return (
      text.length >= 2 &&
      /[가-힣]/.test(text) &&
      !/^\d+$/.test(text) &&
      !text.includes('올바른 문장을 선택해 주세요')
    );
  }
}