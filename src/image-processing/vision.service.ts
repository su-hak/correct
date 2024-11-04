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
    boundingBoxes: any[]
}> {
    try {
        // 이미지 최적화
        const optimizedBuffer = await this.optimizeImage(imageBuffer);
        
        // Vision API 요청
        const response = await axios.post(
            `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
            {
                requests: [{
                    image: {
                        content: optimizedBuffer.toString('base64')
                    },
                    features: [{
                        type: 'DOCUMENT_TEXT_DETECTION',  // TEXT_DETECTION 대신 DOCUMENT_TEXT_DETECTION 사용
                        model: 'builtin/latest'
                    }],
                    imageContext: {
                        languageHints: ['ko'],
                        textDetectionParams: {
                            enableTextDetectionConfidenceScore: true
                        }
                    }
                }]
            },
            {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const textAnnotations = response.data.responses[0]?.textAnnotations;
        
        if (!textAnnotations || textAnnotations.length === 0) {
            this.logger.warn('No text detected in the image');
            return { sentences: [], boundingBoxes: [] };
        }

        // 텍스트 추출 및 처리
        const text = textAnnotations[0].description;
        this.logger.debug(`Raw detected text: ${text}`);

        // 문장 분리 및 필터링 개선
        let sentences = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(this.isValidKoreanSentence);

        // 중복 제거
        sentences = [...new Set(sentences)];

        // 최대 5개 문장으로 제한
        sentences = sentences.slice(0, 5);

        this.logger.debug(`Processed sentences: ${JSON.stringify(sentences)}`);

        // 바운딩 박스 추출
        const boundingBoxes = textAnnotations
            .slice(1)
            .map(annotation => annotation.boundingPoly?.vertices || []);

        return { sentences, boundingBoxes };

    } catch (error) {
        this.logger.error('Vision API error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        throw error;
    }
}

private async optimizeImage(buffer: Buffer): Promise<Buffer> {
  try {
      return await sharp(buffer)
          .resize(1920, 1080, {
              fit: 'inside',
              withoutEnlargement: true
          })
          .normalize() // 이미지 정규화
          .sharpen() // 선명도 개선
          .jpeg({
              quality: 90,
              force: true,
              mozjpeg: true
          })
          .toBuffer();
  } catch (error) {
      this.logger.error('Image optimization failed:', error);
      return buffer;
  }
}

private isValidKoreanSentence(text: string): boolean {
  if (!text || text.length === 0) return false;
  
  // 영어나 숫자만 있는 경우 제외
  if (/^[a-zA-Z0-9\s]+$/.test(text)) return false;
  
  // "올바른 문장을 선택해 주세요" 제외
  if (text.includes('올바른 문장을 선택해 주세요')) return false;
  
  // 한글이 포함된 경우만 유효
  return /[가-힣]/.test(text);
}
}