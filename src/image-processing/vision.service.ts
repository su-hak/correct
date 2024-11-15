import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';
import { GrammarService } from '../grammar/grammar.service';
import { ENABLE_ERROR_LOGS, ENABLE_PERFORMANCE_LOGS } from 'src/constants/Logger.constants';
import stringSimilarity from 'string-similarity';

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
    const start = ENABLE_PERFORMANCE_LOGS ? Date.now() : 0;
    try {
      // 1. 이미지 최적화 및 바이너리로 변환
      const optimizeStart = ENABLE_PERFORMANCE_LOGS ? Date.now() : 0;
      const binaryBuffer = await sharp(imageBuffer)
        .resize(800, null, { 
          withoutEnlargement: true,
          kernel: sharp.kernel.nearest
        })
        .jpeg({ quality: 80 })
        .toBuffer();
        if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.log(`Image optimization took: ${Date.now() - optimizeStart}ms`);
        }

      // 2. 바이너리를 base64로 인코딩
      const base64Start = ENABLE_PERFORMANCE_LOGS ? Date.now() : 0;
      const base64Image = binaryBuffer.toString('base64');
      if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.log(`Base64 encoding took: ${Date.now() - base64Start}ms`);
      }
      // 3. Vision API 호출
      const apiStart = ENABLE_PERFORMANCE_LOGS ? Date.now() : 0;
      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          requests: [{
            image: {
              content: base64Image
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
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip'
          },
          timeout: 5000
        }
      );
      if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.log(`Vision API call took: ${Date.now() - apiStart}ms`);
      }
      const textAnnotations = response.data.responses[0]?.textAnnotations;
      if (!textAnnotations || textAnnotations.length === 0) {
        return {
          sentences: [],
          error: 'No text detected'
        };
      }

      const processStart = ENABLE_PERFORMANCE_LOGS ? Date.now() : 0;
      const sentences = textAnnotations[0].description
        .split('\n')
        .map(s => s.trim())
        .filter(s => s && this.isValidKoreanSentence(s));
      
        if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.log(`Text processing took: ${Date.now() - processStart}ms`);
      this.logger.log(`Total Vision Service took: ${Date.now() - start}ms`);
        }
      return {
        sentences: sentences.slice(0, 5)
      };

    } catch (error) {
      if (ENABLE_ERROR_LOGS) {  // 에러 로그는 별도 설정으로 관리
        this.logger.error('Vision Service error:', error);
      }
      if (ENABLE_PERFORMANCE_LOGS) {
        this.logger.error(`Failed after ${Date.now() - start}ms`);
      }
      return {
        sentences: [],
        error: 'Analysis failed'
      };
    }
  }

  private isValidKoreanSentence(text: string): boolean {
    const referenceText = '올바른 문장을 선택해 주세요';
    const similarityThreshold = 0.7;
    const similarity = stringSimilarity.compareTwoStrings(text, referenceText);
  
    return (
      text.length >= 2 &&
      /[가-힣]/.test(text) && 
      !/^\d+$/.test(text) &&
      similarity < similarityThreshold
    );
  }
}