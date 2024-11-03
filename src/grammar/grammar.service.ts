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
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(private configService: ConfigService, private readonly httpService: HttpService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  // 모든 문장 평가를 위한 단일 API 호출 메서드
  private async evaluateSentencesBatch(sentences: string[]): Promise<number[]> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `다음 한국어 문장들의 문법적 정확성과 자연스러움을 평가해주세요.
                
                평가 기준:
                1. 단어의 유효성: 모든 단어가 표준국어대사전에 등재된 단어인가?
                2. 문법적 정확성: 문법 구조가 올바른가?
                3. 의미의 명확성: 문장이 명확하게 전달되는가?
                4. 문장의 자연스러움: 어순, 조사 사용, 단어 선택이 자연스러운가?
                
                각 문장에 대해 1-100점 사이의 점수만 쉼표로 구분하여 순서대로 응답하세요.`
            },
            {
              role: "user",
              content: sentences.join('\n')
            }
          ],
          temperature: 0.3,
          max_tokens: 50,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const scores = response.data.choices[0].message.content
        .split(',')
        .map(s => parseInt(s.trim()));

      // 캐시 업데이트
      sentences.forEach((sentence, index) => {
        this.cache.set(sentence, {
          result: { score: scores[index], feedback: '' },
          timestamp: Date.now()
        });
      });

      return scores;
    } catch (error) {
      this.logger.error(`Failed to evaluate sentences batch: ${error.message}`);
      throw error;
    }
  }

  // 캐시 확인 및 필요한 문장만 평가
  private async evaluateWithCacheCheck(sentences: string[]): Promise<number[]> {
    const results: (number | undefined)[] = new Array(sentences.length);
    const uncachedSentences: { sentence: string; index: number }[] = [];

    // 캐시 확인
    sentences.forEach((sentence, index) => {
      const cached = this.cache.get(sentence);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        results[index] = cached.result.score;
      } else {
        uncachedSentences.push({ sentence, index });
      }
    });

    // 캐시되지 않은 문장들만 평가
    if (uncachedSentences.length > 0) {
      const uncachedResults = await this.evaluateSentencesBatch(
        uncachedSentences.map(item => item.sentence)
      );

      uncachedResults.forEach((score, i) => {
        results[uncachedSentences[i].index] = score;
      });
    }

    return results as number[];
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{ correctSentence: string; correctIndex: number; sentenceScores: number[] }> {
    try {
      const scores = await this.evaluateWithCacheCheck(sentences);
      const maxScore = Math.max(...scores);
      const correctIndex = scores.indexOf(maxScore);

      return {
        correctSentence: sentences[correctIndex],
        correctIndex,
        sentenceScores: scores
      };
    } catch (error) {
      this.logger.error(`Failed to find most natural sentence: ${error.message}`);
      throw error;
    }
  }

  // 기존 메서드들과의 호환성 유지
  async checkGrammar(sentences: string[]): Promise<{ correctSentence: string; correctIndex: number }> {
    const { correctSentence, correctIndex } = await this.findMostNaturalSentence(sentences);
    return { correctSentence, correctIndex };
  }

  async findMostNaturalSentenceIndex(sentences: string[]): Promise<number> {
    const { correctIndex } = await this.findMostNaturalSentence(sentences);
    return correctIndex;
  }


}