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
  
      // 이미지 전처리 강화
      const optimizedBuffer = await sharp(imageBuffer)
        .rotate()  // 자동 회전 보정
        .resize({
          width: 1280,
          height: 1280,
          fit: 'inside',
          withoutEnlargement: true
        })
        .normalize()  // 자동 대비 조정
        .modulate({
          brightness: 1.1,
          saturation: 1.1
        })
        .sharpen({
          sigma: 1.5,
          m1: 1.5,
          m2: 0.7,
        })
        .toFormat('jpeg', {
          quality: 95,
          chromaSubsampling: '4:4:4'
        })
        .toBuffer();
  
      // Vision API 호출 시 설정 강화
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
              languageHints: ['ko'],
              textDetectionParams: {
                enableTextDetectionConfidenceScore: true
              }
            }
          }]
        },
        { timeout: 10000 }
      );
  
      // 디버그용 로그 추가
      this.logger.debug('Vision API response:', JSON.stringify(visionResponse.data, null, 2));

      const textAnnotations = visionResponse.data.responses[0]?.textAnnotations;
      
      // 텍스트 인식 실패 처리
      if (!textAnnotations || textAnnotations.length === 0) {
        this.logger.warn('No text detected in image');
        return {
          type: 'error',
          message: 'No text detected in image'
        };
      }

      // 전체 텍스트를 줄 단위로 분리
      const allLines = textAnnotations[0].description
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      this.logger.debug('Detected lines:', allLines);

      if (allLines.length === 0) {
        return {
          type: 'error',
          message: 'No valid text lines detected'
        };
      }

      // 타이틀 패턴 매칭 개선
      const titlePatterns = [
        /올바른\s*문장을?\s*선택해?\s*주[세셰]요?/,
        /바른\s*문장[을을]?\s*선택해?\s*주[세셰]요?/,
        /문장[을을]?\s*선택해?\s*주[세셰]요?/,
        /올바른\s*문장/  // 부분 매칭도 허용
      ];

      let titleIndex = allLines.findIndex(line => 
        titlePatterns.some(pattern => pattern.test(line))
      );

      // 타이틀을 찾지 못한 경우 첫 번째 줄을 타이틀로 가정
      if (titleIndex === -1) {
        titleIndex = 0;
        this.logger.warn('Using first line as title:', allLines[0]);
      }

      // 타이틀 이후의 문장들 추출
      const remainingLines = allLines.slice(titleIndex + 1);
      
      // 유효한 문장 필터링
      const validSentences = remainingLines
        .filter(line => this.isValidKoreanSentence(line));

      if (validSentences.length < 5) {
        return {
          type: 'error',
          message: 'Not enough valid sentences detected'
        };
      }

      // 정확히 5개의 문장만 사용
      const finalSentences = validSentences.slice(0, 5);
      
      const grammarResult = await this.grammarService.findMostNaturalSentence(finalSentences);

      // 응답 데이터 구조 수정
      return {
        type: 'sentences',
        data: {
          sentences: finalSentences,  // 문장 배열
          correctIndex: grammarResult.correctIndex,  // 정답 인덱스
          correctSentence: grammarResult.correctSentence,  // 정답 문장
          sentenceScores: grammarResult.sentenceScores  // 점수 배열
        }
      };

    } catch (error) {
      this.logger.error('Vision API error:', error);
      return {
        type: 'error',
        message: 'Analysis failed'
      };
    }
  }

  private isValidKoreanSentence(text: string): boolean {
    // 기본 검증
    if (!text || text.length < 2) return false;
    
    // 한글 포함 여부
    if (!/[가-힣]/.test(text)) return false;
    
    // 제외할 패턴
    const excludePatterns = [
      /^\d+$/,
      /^\s*$/,
      /^[A-Za-z\s]+$/,
      /^[×%\d\s]+$/
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