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
        return {
          sentences: [],
          error: 'No text detected'
        };
      }

      const sentences = textAnnotations[0].description
        .split('\n')
        .map(s => s.trim())
        .filter(s => s && this.isValidKoreanSentence(s));

      return {
        sentences: sentences.slice(0, 5)
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
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