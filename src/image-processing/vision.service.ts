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

  private isValidKoreanSentence(text: string): boolean {
    // 더 엄격한 문장 검증
    return (
      /^[가-힣\s.,!?]+$/.test(text) && // 한글, 공백, 문장부호만 허용
      text.length >= 4 && // 최소 길이
      !text.includes('올바른') &&
      !text.includes('선택') &&
      !text.includes('주세요')
    );
  }

  private isInGuideArea(vertices: any[], imageSize: { width: number; height: number }): boolean {
    // 가이드라인 영역 계산 (이미지의 중앙 80% x 40%)
    const guideArea = {
      left: imageSize.width * 0.1,
      right: imageSize.width * 0.9,
      top: imageSize.height * 0.3,
      bottom: imageSize.height * 0.7
    };

    // 텍스트 블록의 중심점 계산
    const center = {
      x: vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length,
      y: vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length
    };

    return (
      center.x >= guideArea.left &&
      center.x <= guideArea.right &&
      center.y >= guideArea.top &&
      center.y <= guideArea.bottom
    );
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<{
    sentences: string[];
    boundingBoxes: any[];
    correctIndex: number;
    correctSentence: string;
    sentenceScores: number[];
  }> {
    try {
      // 이미지 크기 가져오기
      const metadata = await sharp(imageBuffer).metadata();
      
      // 이미지 최적화
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
        return this.getEmptyResult();
      }

      // 가이드라인 영역 내의 유효한 문장만 필터링
      const validBlocks = textAnnotations
        .slice(1)  // 첫 번째는 전체 텍스트라서 제외
        .filter(block => 
          this.isValidKoreanSentence(block.description) &&
          this.isInGuideArea(block.boundingPoly.vertices, {
            width: metadata.width || 1024,
            height: metadata.height || 1024
          })
        )
        .sort((a, b) => {
          // 세로 위치로 정렬
          const aY = a.boundingPoly.vertices.reduce((sum, v) => sum + v.y, 0) / 4;
          const bY = b.boundingPoly.vertices.reduce((sum, v) => sum + v.y, 0) / 4;
          return aY - bY;
        });

      const sentences = validBlocks
        .map(block => block.description.trim())
        .slice(0, 5);  // 최대 5개만

      if (sentences.length !== 5) {
        return this.getEmptyResult();
      }

      // 문법 평가
      const grammarResult = await this.grammarService.findMostNaturalSentence(sentences);

      return {
        sentences,
        boundingBoxes: validBlocks.map(b => b.boundingPoly.vertices),
        correctIndex: grammarResult.correctIndex,
        correctSentence: grammarResult.correctSentence,
        sentenceScores: grammarResult.sentenceScores
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
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
  }
}