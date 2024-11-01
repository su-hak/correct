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
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간 캐시

  constructor(
    private configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{ 
    correctSentence: string, 
    correctIndex: number, 
    sentenceScores: number[] 
  }> {
    // 1. 초기 임시 결과 생성
    const initialResult = this.getInitialResult(sentences);
    
    // 2. 백그라운드에서 실제 평가 시작
    this.evaluateInBackground(sentences).then(result => {
      // 결과가 준비되면 캐시 업데이트
      sentences.forEach((sentence, index) => {
        this.cache.set(sentence, {
          result: { score: result.sentenceScores[index], feedback: '' },
          timestamp: Date.now()
        });
      });
    });

    // 3. 초기 결과 반환
    return initialResult;
  }

  private getInitialResult(sentences: string[]) {
    // 캐시된 결과가 있는 문장들 확인
    const cachedScores = sentences.map(sentence => {
      const cached = this.cache.get(sentence);
      return cached && Date.now() - cached.timestamp < this.CACHE_TTL
        ? cached.result.score
        : 50; // 기본값
    });

    const maxScore = Math.max(...cachedScores);
    const correctIndex = cachedScores.indexOf(maxScore);

    return {
      correctSentence: sentences[correctIndex],
      correctIndex,
      sentenceScores: cachedScores
    };
  }

  private async evaluateInBackground(sentences: string[]) {
    try {
      const filteredSentences = sentences.filter(this.isValidSentence);
      const evaluations = await Promise.all(
        filteredSentences.map(sentence => this.evaluateSentence(sentence))
      );

      const sentenceScores = evaluations.map(evals => evals.score);
      const maxScore = Math.max(...sentenceScores);
      const mostNaturalIndex = sentenceScores.indexOf(maxScore);
      const correctSentence = filteredSentences[mostNaturalIndex];
      const correctIndex = sentences.indexOf(correctSentence);

      return {
        correctSentence: correctSentence || sentences[0],
        correctIndex: correctIndex !== -1 ? correctIndex : 0,
        sentenceScores
      };
    } catch (error) {
      this.logger.error(`Background evaluation failed: ${error.message}`);
      return {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: sentences.map(() => 50)
      };
    }
  }

  private isValidSentence(sentence: string): boolean {
    if (/^[a-zA-Z\s]+$/.test(sentence) || /^\d+$/.test(sentence)) {
      return false;
    }
    if (sentence.includes('올바른 문장을 선택해 주세요')) {
      return false;
    }
    return /[가-힣]/.test(sentence);
  }

  async evaluateSentence(sentence: string): Promise<EvaluationResult> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo", // 더 빠른 모델로 변경
          messages: [
            {
              role: "system",
              content: "문장의 문법적 정확성을 1-100 점수로만 평가하세요."
            },
            {
              role: "user",
              content: sentence
            }
          ],
          temperature: 0.3,
          max_tokens: 5, // 응답 길이 최소화
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const score = parseInt(response.data.choices[0].message.content.trim(), 10);
      return { score, feedback: '' };
    } catch (error) {
      this.logger.error(`Failed to evaluate sentence: ${error.message}`);
      return { score: 50, feedback: '' }; // 오류 시 중간값 반환
    }
  }

  // 기존 메서드들과의 호환성을 위해 유지
  async checkGrammar(sentences: string[]): Promise<{ correctSentence: string, correctIndex: number }> {
    const result = await this.findMostNaturalSentence(sentences);
    return {
      correctSentence: result.correctSentence,
      correctIndex: result.correctIndex
    };
  }

  async findMostNaturalSentenceIndex(sentences: string[]): Promise<number> {
    const result = await this.findMostNaturalSentence(sentences);
    return result.correctIndex;
  }
}