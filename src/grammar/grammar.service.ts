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
      // 학습 데이터 확인
      PerformanceLogger.start('learningCheck');
      const learningResult = await this.grammarLearningService.findSimilarCorrection(sentences);
      const learningTime = PerformanceLogger.end('learningCheck', this.logger);

      if (learningResult.found) {
        PerformanceLogger.end('findMostNaturalSentence', this.logger);
        return {
          correctSentence: learningResult.correctSentence!,
          correctIndex: learningResult.correctIndex!,
          sentenceScores: learningResult.sentenceScores!
        };
      }

      // OpenAI API 호출
      PerformanceLogger.start('openaiAPI');

      const openaiPromise = axios.post<{
        choices: Array<{
          message: {
            content: string;
          };
        }>;
      }>(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "주어진 문장들 중 가장 자연스럽고 맞춤법이 정확한 문장의 인덱스만 숫자로 답하세요. 기준은 다음과 같습니다:\n1. 맞춤법이 정확한가\n2. 주어+목적어+서술어 순서가 맞는가\n3. 도치법이 없는가\n4. 조사와 어미가 올바른가"
            },
            {
              role: "user",
              content: `아래 문장 중에서 가장 자연스러운 문장의 번호만 답하세요:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
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
          timeout: OPENAI_TIMEOUT
        }
      );
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OpenAI timeout')), OPENAI_TIMEOUT);
      });

      const openaiResponse = await Promise.race([openaiPromise, timeoutPromise]) as AxiosResponse<{
        choices: Array<{
          message: {
            content: string;
          };
        }>;
      }>;

      const apiTime = PerformanceLogger.end('openaiAPI', this.logger);

      // 결과 처리
      PerformanceLogger.start('resultProcessing');
      const index = parseInt(openaiResponse.data.choices[0]?.message?.content?.trim() ?? '0');
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : 0;

      // 비동기로 학습 처리
      this.grammarLearningService.learnCorrection(sentences[validIndex], sentences);

      const result = {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: sentences.map((_, i) => i === validIndex ? 100 : 0)
      };

      PerformanceLogger.end('resultProcessing', this.logger);
      PerformanceLogger.end('findMostNaturalSentence', this.logger);

      return result;

    } catch (error) {
      // OpenAI API 타임아웃 또는 다른 에러 발생 시
      this.logger.error('OpenAI API error, falling back to best guess', error);
      PerformanceLogger.end('findMostNaturalSentence', this.logger);

      const bestGuess = await this.grammarLearningService.getBestGuess(sentences);
      return {
        correctSentence: bestGuess.sentence,
        correctIndex: bestGuess.index,
        sentenceScores: sentences.map((_, i) => i === bestGuess.index ? 100 : 0)
      };
    }
  }
}