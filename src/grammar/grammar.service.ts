import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface EvaluationResult {
  score: number;
  feedback: string;
}

interface CacheEntry {
  result: EvaluationResult;
  timestamp: number;
}

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);
  private readonly openaiApiKey: string;

  constructor(private configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    try {
      if (!sentences || sentences.length === 0) {
        return {
          correctSentence: '',
          correctIndex: -1,
          sentenceScores: []
        };
      }

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "주어진 한국어 문장들 중 가장 문법적으로 올바른 문장의 인덱스만 숫자로 답하세요."
            },
            {
              role: "user",
              content: sentences.join('\n')
            }
          ],
          temperature: 0.1,
          max_tokens: 3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const correctIndex = parseInt(response.data.choices[0].message.content);
      
      // 유효한 인덱스인지 확인
      const validIndex = !isNaN(correctIndex) && 
                        correctIndex >= 0 && 
                        correctIndex < sentences.length;

      const finalIndex = validIndex ? correctIndex : 0;
      const scores = Array(sentences.length).fill(0);
      scores[finalIndex] = 100;

      return {
        correctSentence: sentences[finalIndex],
        correctIndex: finalIndex,
        sentenceScores: scores
      };

    } catch (error) {
      this.logger.error(`Grammar check error: ${error.message}`, {
        sentences,
        error: error.stack
      });

      // 에러 발생 시 첫 번째 문장을 반환
      return {
        correctSentence: sentences[0] || '',
        correctIndex: 0,
        sentenceScores: sentences.map(() => 0)
      };
    }
  }
}