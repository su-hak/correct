import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ENABLE_ERROR_LOGS, ENABLE_PERFORMANCE_LOGS } from 'src/constants/Logger.constants';

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);
  private readonly openaiApiKey: string;

  constructor(
    private configService: ConfigService,
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

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo-1106",
          messages: [
            {
              role: "system",
              content: `당신은 한국어 문법 전문가입니다. 
              주어진 문장들 중에서 다음 기준에 모두 부합하는 가장 자연스러운 문장을 선택하세요(설명은 생략하세요.):
              단어의 유효성: 모든 단어가 표준국어대사전에 등재된 단어인가요?
              문법적 정확성: 문법 구조(주어, 목적어, 서술어 등 도치법 허용 안 함)가 올바른가요?
              의미의 명확성: 문장이 해석에 혼동 없이 명확하게 전달되나요(문장의 뜻이 모호하지는 않나요?)?
              문장의 자연스러움: 어순, 조사 사용, 단어 선택이 자연스러운가요?

              반드시 위의 모든 기준을 검토한 후, 가장 올바른 문장의 번호만 답하세요.`
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
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
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