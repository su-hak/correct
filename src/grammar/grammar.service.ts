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
              content: `당신은 한국어 맞춤법 전문가입니다. 
              다음 기준으로 가장 올바른 문장을 선택하세요:
              1. 맞춤법이 정확한가?
              2. 주어+목적어+서술어 순서가 올바른가? (도치 불가)
              3. 조사와 어미가 올바르게 사용되었는가?
              문장 번호만 숫자로 답하세요.`
            },
            {
              role: "user",
              content: sentences.map((s, i) => `${i}. ${s}`).join('\n')
            }
          ],
          temperature: 0.1,
          max_tokens: 1,
          presence_penalty: 0,
          frequency_penalty: 0,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 3000  // 3초 타임아웃
        }
      );

      const correctIndex = parseInt(response.data.choices[0].message.content);
      
      if (isNaN(correctIndex) || correctIndex < 0 || correctIndex >= sentences.length) {
        throw new Error('Invalid GPT response');
      }

      const scores = Array(sentences.length).fill(60);
      scores[correctIndex] = 100;

      return {
        correctSentence: sentences[correctIndex],
        correctIndex,
        sentenceScores: scores
      };

    } catch (error) {
      this.logger.error(`Grammar check error: ${error.message}`, {
        sentences,
        error: error.stack
      });

      // 에러 발생 시 첫 번째 문장 반환
      return {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: sentences.map(() => 60)
      };
    }
  }
}