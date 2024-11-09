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

  async detectTextInImage(imageBuffer: Buffer): Promise<{
    sentences: string[];
    boundingBoxes: any[];
    correctIndex: number;
    correctSentence: string;
    sentenceScores: number[];
  }> {
    try {
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

      // '올바른 문장을 선택해 주세요' 찾기
      const fullText = textAnnotations[0].description;
      const lines = fullText.split('\n');
      const titleIndex = lines.findIndex(line => 
        line.includes('올바른 문장을 선택해 주세요') && 
        this.getConfidenceScore(textAnnotations, line) >= 0.7
      );

      if (titleIndex === -1) {
        return this.getEmptyResult();
      }

      // 타이틀 이후 5개 문장만 추출
      const sentences = lines
        .slice(titleIndex + 1)
        .filter(line => 
          line.trim() && 
          this.isValidKoreanSentence(line) &&
          this.getConfidenceScore(textAnnotations, line) >= 0.7
        )
        .slice(0, 5);

      if (sentences.length === 0) {
        return this.getEmptyResult();
      }

      // 문법 평가
      const grammarResult = await this.grammarService.findMostNaturalSentence(sentences);

      // 해당하는 바운딩 박스만 포함
      const relevantBoxes = textAnnotations.slice(1)
        .filter(t => sentences.includes(t.description))
        .map(t => t.boundingPoly?.vertices || []);

      return {
        sentences,
        boundingBoxes: relevantBoxes,
        correctIndex: grammarResult.correctIndex,
        correctSentence: grammarResult.correctSentence,
        sentenceScores: grammarResult.sentenceScores
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
      return this.getEmptyResult();
    }
  }

  private getConfidenceScore(annotations: any[], text: string): number {
    const annotation = annotations.find(a => a.description === text);
    return annotation?.confidence || 0;
  }

  private isValidKoreanSentence(text: string): boolean {
    return /[가-힣]/.test(text) && 
           !text.includes('올바른 문장을 선택해 주세요') &&
           text.length >= 2;
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