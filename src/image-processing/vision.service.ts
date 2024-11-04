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
      const optimizedBuffer = await this.optimizeImage(imageBuffer);
      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          requests: [{
            image: {
              content: optimizedBuffer.toString('base64')
            },
            features: [{
              type: 'TEXT_DETECTION',
              maxResults: 10
            }],
            imageContext: {
              languageHints: ['ko']
            }
          }]
        }
      );

      const textAnnotations = response.data.responses[0]?.textAnnotations || [];
      const rawText = textAnnotations[0]?.description || '';
      
      // 문장 추출 및 필터링 최적화
      const sentences = rawText.split('\n')
        .map(s => s.trim())
        .filter(s => s && this.isValidKoreanSentence(s))
        .slice(0, 5);

      if (sentences.length === 0) {
        return {
          sentences: [],
          boundingBoxes: [],
          correctIndex: -1,
          correctSentence: '',
          sentenceScores: []
        };
      }

      // 문법 평가 로직 단순화
      const defaultScore = 80;  // 기본 점수
      const sentenceScores = sentences.map(() => defaultScore);
      const correctIndex = 0;  // 첫 번째 문장을 기본값으로 사용

      return {
        sentences,
        boundingBoxes: textAnnotations.slice(1).map(t => t.boundingPoly?.vertices || []),
        correctIndex,
        correctSentence: sentences[correctIndex],
        sentenceScores
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
      throw new InternalServerErrorException('Failed to process image');
    }
  }

  private async optimizeImage(buffer: Buffer): Promise<Buffer> {
    try {
      return await sharp(buffer)
        .resize(800, 600, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: 80,
          force: true
        })
        .toBuffer();
    } catch (error) {
      return buffer;
    }
  }

  private isValidKoreanSentence(text: string): boolean {
    return /[가-힣]/.test(text) && !text.includes('올바른 문장을 선택해 주세요');
  }
}