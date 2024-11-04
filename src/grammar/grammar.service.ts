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
      const scores = Array(sentences.length).fill(0);
      scores[correctIndex] = 100;

      return {
        correctSentence: sentences[correctIndex],
        correctIndex,
        sentenceScores: scores
      };
    } catch (error) {
      this.logger.error(`GPT API error: ${error.message}`);
      return {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: sentences.map(() => 0)
      };
    }
  }
}