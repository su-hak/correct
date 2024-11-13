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
      // 이미지 전처리 최적화
      const optimizedBuffer = await sharp(imageBuffer)
        .resize(1920, 1080, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .sharpen()
        .normalize()
        .toBuffer();

      // Vision API 호출
      const visionResponse = await axios.post(
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
            imageContext: {
              languageHints: ['ko']
            }
          }]
        },
        { timeout: 10000 }
      );

      const textAnnotations = visionResponse.data.responses[0]?.textAnnotations;
      
      if (!textAnnotations || textAnnotations.length === 0) {
        return {
          type: 'error',
          message: 'No text detected'
        };
      }

      // 텍스트를 줄 단위로 분리하고 필터링
      const lines = textAnnotations[0].description
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length >= 2 && this.isKoreanSentence(line));

      if (lines.length < 2) {
        return {
          type: 'error',
          message: 'Not enough valid sentences detected'
        };
      }

      // 문법 분석 수행
      const grammarResult = await this.grammarService.findMostNaturalSentence(lines);

      return {
        type: 'result',
        data: {
          sentences: lines,
          correctIndex: grammarResult.correctIndex,
          correctSentence: grammarResult.correctSentence
        }
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
      return {
        type: 'error',
        message: 'Analysis failed'
      };
    }
  }

  private isKoreanSentence(text: string): boolean {
    return (
      text.length >= 2 &&
      /[가-힣]/.test(text) &&
      !/^\d+$/.test(text) &&
      !/^[×%\d\s]+$/.test(text)
    );
  }
}