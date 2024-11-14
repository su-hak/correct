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
    const startTime = Date.now();
    try {
      // 이미지 전처리 시간 측정
      const preprocessStart = Date.now();
      const optimizedBuffer = await sharp(imageBuffer)
        .resize(1920, 1080, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .sharpen()
        .normalize()
        .toBuffer();
      this.logger.log(`Image preprocessing took ${Date.now() - preprocessStart}ms`);

      // Vision API 호출 시간 측정
      const apiStart = Date.now();
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
        }
      );
      this.logger.log(`Vision API call took ${Date.now() - apiStart}ms`);

      const textAnnotations = visionResponse.data.responses[0]?.textAnnotations;
      
      if (!textAnnotations || textAnnotations.length === 0) {
        return {
          type: 'error',
          message: '텍스트를 인식할 수 없습니다.'
        };
      }

      // 문장 처리 시간 측정
      const processingStart = Date.now();
      const allLines = textAnnotations[0].description
        .split('\n')
        .map(line => line.trim());

      // 가이드라인 영역의 문장만 필터링 (지정된 패턴과 한글만 포함)
      const sentences = allLines
        .filter(line => {
          // 필수 조건: 2글자 이상의 한글 포함
          if (line.length < 2 || !/[가-힣]/.test(line)) return false;
          
          // 제외할 패턴들
          const excludePatterns = [
            /^[A-Za-z\s]+$/,  // 영문만
            /^[0-9\s]+$/,     // 숫자만
            /ChatGPT/i,       // ChatGPT 관련
            /^데이터/,        // 데이터로 시작
            /GPT/i,           // GPT 포함
            /[×÷+\-=]/       // 수학 기호
          ];
          
          return !excludePatterns.some(pattern => pattern.test(line));
        });

      this.logger.log(`Text processing took ${Date.now() - processingStart}ms`);
      this.logger.log(`Total processing took ${Date.now() - startTime}ms`);

      if (sentences.length < 2) {
        return {
          type: 'error',
          message: '분석할 문장을 찾을 수 없습니다.'
        };
      }

      return {
        type: 'result',
        data: {
          sentences: sentences.slice(0, 5)
        }
      };

    } catch (error) {
      this.logger.error(`Error in Vision Service (${Date.now() - startTime}ms):`, error);
      return {
        type: 'error',
        message: '이미지 분석 중 오류가 발생했습니다.'
      };
    }
  }
}