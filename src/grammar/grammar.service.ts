import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { ENABLE_ERROR_LOGS, ENABLE_PERFORMANCE_LOGS } from 'src/constants/Logger.constants';
import { OptimizedHttpService } from 'src/shared/optimized-http.service';
import * as https from 'https';

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);
  private readonly openaiApiKey: string;
  private readonly httpClient: AxiosInstance;

  constructor(
    private configService: ConfigService,
    private optimizedHttpService: OptimizedHttpService,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    const start = ENABLE_PERFORMANCE_LOGS ? Date.now() : 0;
    try {
      const gptStart = ENABLE_PERFORMANCE_LOGS ? Date.now() : 0;
      if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.debug('Input sentences:', sentences);
      }

      const response = await this.optimizedHttpService.requestWithRetry({
        method: 'post',
        url: 'https://api.openai.com/v1/chat/completions',
        data: {
          model: "gpt-4o-mini-2024-07-18",
          messages: [
            {
              role: "system",
              content: `당신은 한국어 문법 전문가입니다. 
              content: "주어진 문장들 중 가장 자연스럽고 맞춤법이 정확한 문장의 인덱스만 숫자로 답하세요. 기준은 다음과 같습니다:\n1. 맞춤법이 정확한가\n2. 주어+목적어+서술어 순서가 맞는가\n3. 도치법이 없는가\n4. 조사와 어미가 올바른가"`
            },
            {
              role: "user",
              content: `아래 문장 중에서 가장 자연스러운 문장의 번호만 답하세요:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
            }
          ],
          temperature: 0,
          max_tokens: 1,
          presence_penalty: 0,
          frequency_penalty: 0,
        },
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000,
        }
      );
      if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.log(`GPT API call took: ${Date.now() - gptStart}ms`);
      }

      const processStart = ENABLE_PERFORMANCE_LOGS ? Date.now() : 0;
      const index = parseInt(response.data.choices[0].message.content.trim());
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : 0;
      
      if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.log(`Result processing took: ${Date.now() - processStart}ms`);
      }

      if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.log(`Total Grammar Service took: ${Date.now() - start}ms`);
      }

      return {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: sentences.map((_, i) => i === validIndex ? 100 : 0)
      };

    } catch (error) {
      if (ENABLE_ERROR_LOGS) {  // 에러 로그는 별도 관리
        this.logger.error('Grammar Service error:', error);
      }
      if (ENABLE_PERFORMANCE_LOGS) {
        this.logger.error(`Failed after ${Date.now() - start}ms`);
      }
      return {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: sentences.map((_, i) => i === 0 ? 100 : 0)
      };
    }
  }
}