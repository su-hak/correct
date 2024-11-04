import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GrammarService {
  private readonly openaiApiKey: string;
  private readonly cache = new Map<string, { result: any; timestamp: number }>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1시간

  constructor(private configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo-instruct",  // 더 빠른 모델 사용
          messages: [
            {
              role: "user",
              content: `다음 문장들 중 가장 자연스러운 문장의 번호만 숫자로 답하세요:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
            }
          ],
          max_tokens: 1,
          temperature: 0,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 1500  // 1.5초 타임아웃
        }
      );

      const index = parseInt(response.data.choices[0].message.content);
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : 0;

      return {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === validIndex ? 100 : 0)
      };

    } catch (error) {
      // 에러 시 첫 번째 문장 반환 (빠른 실패)
      return {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === 0 ? 100 : 0)
      };
    }
  }
}