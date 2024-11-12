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

      this.logger.log(`Image optimization took ${Date.now() - startTime}ms`);

      const visionPromise = axios.post(
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
        { timeout: 8000 }  // 8초 타임아웃
      );

      this.logger.log(`Vision API request took ${Date.now() - startTime}ms`);

      const [response] = await Promise.all([
        visionPromise
      ]);

      const textAnnotations = response.data.responses[0]?.textAnnotations;
      if (!textAnnotations || textAnnotations.length === 0) {
        this.logger.warn('No text annotations found');
        return this.getEmptyResult();
      }

      // 전체 텍스트를 줄 단위로 분리
      const allLines = textAnnotations[0].description
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      this.logger.debug('All detected lines:', allLines);

      // 타이틀 패턴 매칭을 더 유연하게
      let titleIndex = -1;
      const titlePatterns = [
        /올바른\s*문장을?\s*선택해?\s*주[세셰]요?/,
        /바른\s*문장[을을]?\s*선택해?\s*주[세셰]요?/,
        /문장[을을]?\s*선택해?\s*주[세셰]요?/
      ];

      // 처음 3줄 내에서 타이틀 찾기
      for (let i = 0; i < Math.min(3, allLines.length); i++) {
        if (titlePatterns.some(pattern => pattern.test(allLines[i]))) {
          titleIndex = i;
          break;
        }
      }

      // 타이틀을 찾지 못했다면 첫 번째 줄을 타이틀로 가정
      if (titleIndex === -1) {
        titleIndex = 0;
      }

      this.logger.debug('Title found at index:', titleIndex);

      // 타이틀 이후의 모든 한글 문장 추출
      const candidateSentences = allLines
        .slice(titleIndex + 1)
        .filter(line => this.isValidKoreanSentence(line));

      this.logger.debug('Candidate sentences:', candidateSentences);

      // 최대 10개의 문장까지 고려 (여유있게)
      const validSentences = candidateSentences.slice(0, 10);

      if (validSentences.length < 5) {
        this.logger.warn(`Found only ${validSentences.length} sentences`);
        return this.getEmptyResult();
      }

      // 정확히 5개의 문장 선택
      const finalSentences = validSentences.slice(0, 5);

      // 문법 평가
      const grammarResult = await this.grammarService.findMostNaturalSentence(finalSentences);

      this.logger.log(`Total processing took ${Date.now() - startTime}ms`);

      const result = {
        sentences: finalSentences,
        boundingBoxes: [], // 필요한 경우에만 계산
        correctIndex: grammarResult.correctIndex,
        correctSentence: grammarResult.correctSentence,
        sentenceScores: grammarResult.sentenceScores
      };

      this.logger.debug('최종 반환 데이터:', result);  // 결과 데이터 로깅
      this.logger.debug('문장 목록:', result.sentences);  // 문장 목록 확인

      return result;

    } catch (error) {
      this.logger.error('Vision API error:', error);
      return this.getEmptyResult();
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