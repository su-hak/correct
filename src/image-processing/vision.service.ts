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
      // 1. 이미지 최적화
      const resizedBuffer = await sharp(imageBuffer)
        .resize(800, 600, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 85 })
        .toBuffer();
  
      // 2. Vision API 요청
      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          requests: [{
            image: { content: resizedBuffer.toString('base64') },
            features: [{
              type: 'TEXT_DETECTION',
              model: 'builtin/latest',
              languageHints: ['ko']
            }]
          }]
        }
      );
  
      // 3. 텍스트 추출 및 필터링
      const detections = response.data.responses[0].textAnnotations || [];
      if (detections.length === 0) {
        return { 
          sentences: [], 
          boundingBoxes: [], 
          correctIndex: -1, 
          sentenceScores: [] 
        };
      }
  
      const sentences = detections[0].description
        .split('\n')
        .map(s => s.trim())
        .filter(this.isValidSentence)
        .slice(0, 5);  // 최대 5개 문장만 선택
  
      // 4. 문법 평가 (배치 처리)
      const { correctIndex, sentenceScores } = await this.grammarService.findMostNaturalSentence(sentences);
  
      return {
        sentences,
        boundingBoxes: detections.slice(1).map(d => d.boundingPoly.vertices),
        correctIndex,
        sentenceScores
      };
    } catch (error) {
      this.logger.error(`Failed to analyze image: ${error.message}`);
      throw error;
    }
  }

  private isValidSentence(sentence: string): boolean {
    if (/^[a-zA-Z0-9\s]+$/.test(sentence) || 
        sentence === "올바른 문장을 선택해 주세요" ||
        /^\d+$/.test(sentence)) {
      return false;
    }
    return /[가-힣]/.test(sentence);
  }
}