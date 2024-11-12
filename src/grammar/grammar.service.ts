import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import { GrammarLearningService } from './grammar-Learning.service';
import { PerformanceLogger } from 'src/performance_Logger';

const OPENAI_TIMEOUT = 8000;

@Injectable()
export class GrammarService {
  private readonly openaiApiKey: string;
  private readonly logger = new Logger(GrammarService.name);


  constructor(
    private configService: ConfigService,
    private grammarLearningService: GrammarLearningService
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    PerformanceLogger.start('findMostNaturalSentence');
    try {

      if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
        this.logger.error('Invalid input sentences:', sentences);
        throw new Error('Invalid input sentences');
      }

      this.logger.log(`Processing ${sentences.length} sentences`);
      this.logger.debug('Input sentences:', sentences);

      // 학습 데이터 확인
      PerformanceLogger.start('learningCheck');
      const learningResult = await this.grammarLearningService.findSimilarCorrection(sentences);
      const learningTime = PerformanceLogger.end('learningCheck', this.logger);

      if (learningResult.found && learningResult.correctSentence) {
        return {
          correctSentence: learningResult.correctSentence,
          correctIndex: learningResult.correctIndex ?? 0,
          sentenceScores: learningResult.sentenceScores ?? sentences.map((_, i) => i === 0 ? 100 : 0)
        };
      }

      // OpenAI API 호출
      PerformanceLogger.start('openaiAPI');

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "네이버 맞춤법 검사기와 동일하게 검사해서 올바른 하나의 문장을 골라."
            },
            {
              role: "user",
              content: `아래 문장 중에서 가장 자연스러운 문장의 번호를 빠르게 답하세요:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
            }
          ],
          temperature: 0,
          max_tokens: 1,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 8000
        }
      );

      const index = parseInt(response.data.choices?.[0]?.message?.content?.trim() ?? '0');
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : 0;

       // 비동기 학습 처리를 별도 함수로 분리
       this.handleLearning(sentences[validIndex], sentences);

      return {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: sentences.map((_, i) => i === validIndex ? 100 : 0)
      };

    } catch (error) {
      this.logger.error('Error in findMostNaturalSentence:', error);
      
      // 기본값 반환
      return {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: sentences.map((_, i) => i === 0 ? 100 : 0)
      };
    }
  }

  // 학습 처리를 위한 별도 메소드
  private async handleLearning(correctSentence: string, sentences: string[]): Promise<void> {
    try {
      await this.grammarLearningService.learnCorrection(correctSentence, sentences);
    } catch (error) {
      this.logger.error('Learning error:', error);
    }
  }
}