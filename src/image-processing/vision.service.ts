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

<<<<<<< HEAD
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
=======
  async detectTextInImage(imageBuffer: Buffer): Promise<any> {
    try {
      // 이미지 전처리
      const optimizedBuffer = await sharp(imageBuffer)
        .resize(1920, 1080, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .sharpen()
        .normalize()
        .toBuffer();

      const visionResponse = await axios.post(
>>>>>>> 38f2e1b03e9f45b8fddfe74d22aec85e82cbee2c
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          requests: [{
            image: {
              content: optimizedBuffer.toString('base64')
            },
            features: [{
              type: 'TEXT_DETECTION',
              model: 'builtin/latest'
<<<<<<< HEAD
            }]
=======
            }],
            imageContext: {
              languageHints: ['ko']
            }
>>>>>>> 38f2e1b03e9f45b8fddfe74d22aec85e82cbee2c
          }]
        },
        { timeout: 10000 }
      );

      const textAnnotations = visionResponse.data.responses[0]?.textAnnotations;
      
      if (!textAnnotations || textAnnotations.length === 0) {
<<<<<<< HEAD
        return this.getEmptyResult();
      }

      // 문장 추출 및 간단한 필터링
      const sentences = textAnnotations[0].description
        .split('\n')
        .map(s => s.trim())
        .filter(s => s && this.isValidKoreanSentence(s));

      if (sentences.length === 0) {
        return this.getEmptyResult();
=======
        return {
          type: 'error',
          message: 'No text detected'
        };
      }

      // 텍스트를 줄 단위로 분리
      const allLines = textAnnotations[0].description
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // 타이틀 패턴
      const titlePattern = /올바른?\s*문장[을를]?\s*선택해?\s*주[세셰]요?/;
      
      // 타이틀을 제외한 실제 문장들만 필터링
      const sentences = allLines
        .filter(line => !titlePattern.test(line))
        .filter(line => this.isValidSentence(line));

      if (sentences.length < 2) {
        return {
          type: 'error',
          message: 'Not enough valid sentences detected'
        };
>>>>>>> 38f2e1b03e9f45b8fddfe74d22aec85e82cbee2c
      }

      // 최대 5개의 문장만 선택
      const finalSentences = sentences.slice(0, 5);

      // 문법 분석 수행
      const grammarResult = await this.grammarService.findMostNaturalSentence(finalSentences);

      return {
        type: 'result',
        data: {
          sentences: finalSentences,
          correctIndex: grammarResult.correctIndex,
          correctSentence: grammarResult.correctSentence
        }
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
<<<<<<< HEAD
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
=======
      return {
        type: 'error',
        message: 'Analysis failed'
      };
    }
  }

  private isValidSentence(text: string): boolean {
    // 기본 검증
    if (!text || text.length < 2) return false;
    
    // 한글 포함 여부 확인
    if (!/[가-힣]/.test(text)) return false;
    
    // 제외할 패턴
    const excludePatterns = [
      /^\d+$/,                    // 숫자만
      /^[×%\d\s]+$/,             // 특수문자와 숫자만
      /^[A-Za-z\s]+$/,           // 영문자만
      /올바른?\s*문장/,           // 타이틀 관련 텍스트
      /선택해?\s*주[세셰]요?/     // 타이틀 관련 텍스트
    ];
    
    return !excludePatterns.some(pattern => pattern.test(text));
>>>>>>> 38f2e1b03e9f45b8fddfe74d22aec85e82cbee2c
  }
}