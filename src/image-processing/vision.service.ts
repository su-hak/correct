import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';
import { GrammarService } from 'src/grammar/grammar.service';

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly apiKey: string;
  private readonly MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

  constructor(
    private configService: ConfigService,
    private grammarService: GrammarService
  ) {
    try {
      this.apiKey = this.configService.get('GOOGLE_CLOUD_API_KEY');
      if (!this.apiKey) {
        this.logger.error('GOOGLE_CLOUD_API_KEY is not set in the environment variables');
        throw new Error('GOOGLE_CLOUD_API_KEY is not set');
      }
    } catch (error) {
      this.logger.error(`Error in VisionService constructor: ${error.message}`);
      throw error;
    }
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<{ 
    sentences: string[], 
    boundingBoxes: any[], 
    correctIndex: number, 
    sentenceScores: number[] 
  }> {
    try {
      // 1. 이미지 유효성 검사
      if (!imageBuffer || imageBuffer.length === 0) {
        throw new Error('Empty image buffer received');
      }

      if (imageBuffer.length > this.MAX_IMAGE_SIZE) {
        throw new Error('Image size exceeds maximum limit of 10MB');
      }

      if (!this.isValidImageFormat(imageBuffer)) {
        throw new Error('Invalid image format. Only JPEG and PNG are supported');
      }

      // 2. 이미지 최적화
      let optimizedBuffer: Buffer;
      try {
        optimizedBuffer = await sharp(imageBuffer)
          .resize(800, 600, { 
            fit: 'inside',
            withoutEnlargement: true 
          })
          .jpeg({ 
            quality: 85,
            mozjpeg: true // 더 나은 압축을 위해 mozjpeg 사용
          })
          .toBuffer();
      } catch (error) {
        this.logger.error(`Image optimization failed: ${error.message}`);
        optimizedBuffer = imageBuffer; // 최적화 실패 시 원본 사용
      }

      // 3. Base64 인코딩 및 Vision API 요청 준비
      const base64Image = optimizedBuffer.toString('base64');
      if (!base64Image) {
        throw new Error('Failed to encode image to base64');
      }

      // 4. Vision API 요청
      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          requests: [{
            image: { content: base64Image },
            features: [{
              type: 'TEXT_DETECTION',
              model: 'builtin/latest',
              languageHints: ['ko']
            }],
            imageContext: {
              languageHints: ['ko']
            }
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 30000 // 30초 타임아웃
        }
      );

      // 5. 응답 유효성 검사
      if (!response.data || !response.data.responses || !response.data.responses[0]) {
        throw new Error('Invalid response from Vision API');
      }

      const detections = response.data.responses[0].textAnnotations || [];
      if (detections.length === 0) {
        return { 
          sentences: [], 
          boundingBoxes: [], 
          correctIndex: -1, 
          sentenceScores: [] 
        };
      }

      // 6. 텍스트 추출 및 필터링
      const sentences = detections[0].description
        .split('\n')
        .map(s => s.trim())
        .filter(s => s && this.isValidSentence(s))
        .slice(0, 5);  // 최대 5개 문장만 선택

      if (sentences.length === 0) {
        return {
          sentences: [],
          boundingBoxes: [],
          correctIndex: -1,
          sentenceScores: []
        };
      }

      // 7. 문법 평가
      const { correctIndex, sentenceScores } = await this.grammarService.findMostNaturalSentence(sentences);

      return {
        sentences,
        boundingBoxes: detections.slice(1).map(d => d.boundingPoly?.vertices || []),
        correctIndex,
        sentenceScores
      };

    } catch (error) {
      // 8. 에러 상세 로깅
      this.logger.error(`Failed to analyze image: ${error.message}`, {
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
      });
      
      // API 특정 에러 처리
      if (error.response?.status === 400) {
        throw new Error('Invalid image data or format. Please check the image and try again.');
      }
      
      throw error;
    }
  }

  private isValidImageFormat(buffer: Buffer): boolean {
    // JPEG 시그니처 확인
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return true;
    }
    // PNG 시그니처 확인
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return true;
    }
    return false;
  }

  private isValidSentence(sentence: string): boolean {
    // 빈 문자열 체크 추가
    if (!sentence || sentence.trim().length === 0) {
      return false;
    }

    // 영어, 숫자, 특수문자만 있는 경우 제외
    if (/^[a-zA-Z0-9\s\W]+$/.test(sentence)) {
      return false;
    }

    // "올바른 문장을 선택해 주세요" 제외
    if (sentence.includes("올바른 문장을 선택해 주세요")) {
      return false;
    }

    // 한글이 포함된 문장만 유효하다고 판단
    return /[가-힣]/.test(sentence);
  }
}