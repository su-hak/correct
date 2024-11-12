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

  async detectTextInImage(imageBuffer: Buffer): Promise<any> {
    try {
      this.logger.log('Starting text detection...');
      const startTime = Date.now();

      const optimizedBuffer = await sharp(imageBuffer)
        .resize({ 
          width: 1024,
          height: 1024,
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ 
          quality: 85,
          progressive: true,
          optimizeCoding: true
        })
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
        },
        { timeout: 8000 }
      );

      const textAnnotations = response.data.responses[0]?.textAnnotations;
      if (!textAnnotations || textAnnotations.length === 0) {
        this.logger.warn('No text annotations found');
        return {
          type: 'error',
          message: 'No text detected'
        };
      }

      const allLines = textAnnotations[0].description
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      let titleIndex = -1;
      const titlePatterns = [
        /올바른\s*문장을?\s*선택해?\s*주[세셰]요?/,
        /바른\s*문장[을을]?\s*선택해?\s*주[세셰]요?/,
        /문장[을을]?\s*선택해?\s*주[세셰]요?/
      ];

      for (let i = 0; i < Math.min(3, allLines.length); i++) {
        if (titlePatterns.some(pattern => pattern.test(allLines[i]))) {
          titleIndex = i;
          break;
        }
      }

      if (titleIndex === -1) {
        return {
          type: 'error',
          message: '타이틀을 찾을 수 없습니다.'
        };
      }

      const candidateSentences = allLines
        .slice(titleIndex + 1)
        .filter(line => this.isValidKoreanSentence(line));

      if (candidateSentences.length < 5) {
        return {
          type: 'sentences',
          data: []  // 빈 배열 반환
        };
      }

      const finalSentences = candidateSentences.slice(0, 5);
      const grammarResult = await this.grammarService.findMostNaturalSentence(finalSentences);

      // 최종 결과 반환
      return {
        type: 'sentences',
        data: {
          sentences: finalSentences,
          correctIndex: grammarResult.correctIndex,
          correctSentence: grammarResult.correctSentence,
          sentenceScores: grammarResult.sentenceScores
        }
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
      return {
        type: 'error',
        message: 'Text detection failed'
      };
    }
  }

  private isValidKoreanSentence(text: string): boolean {
    // 조금 더 유연한 검증
    if (!text || text.length < 2) return false;

    // 한글 포함 여부
    if (!/[가-힣]/.test(text)) return false;

    // 제외할 패턴들
    const excludePatterns = [
      /^\d+$/, // 숫자로만 된 텍스트
      /^\s*$/, // 공백만 있는 텍스트
      /^[A-Za-z\s]+$/, // 영어로만 된 텍스트
      /^[×%\d\s]+$/, // 특수문자와 숫자로만 된 텍스트
    ];

    if (excludePatterns.some(pattern => pattern.test(text))) return false;

    return true;
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