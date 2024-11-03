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

  async findMostNaturalSentence(sentences: string[]): Promise<{ correctSentence: string, correctIndex: number, sentenceScores: number[] }> {
    const filteredSentences = sentences.filter(this.isValidSentence);
    const evaluations = await Promise.all(filteredSentences.map(sentence => this.evaluateSentenceWithCache(sentence)));

      const sentenceScores = evaluations.map(evals => evals.score);
      const maxScore = Math.max(...sentenceScores);
      const mostNaturalIndex = sentenceScores.indexOf(maxScore);
      const correctSentence = filteredSentences[mostNaturalIndex];
      const correctIndex = sentences.indexOf(correctSentence);

    this.logger.log(`Original sentences: ${sentences.join(', ')}`);
    this.logger.log(`Filtered sentences: ${filteredSentences.join(', ')}`);
    this.logger.log(`Sentence scores: ${sentenceScores.join(', ')}`);
    this.logger.log(`Correct sentence: ${correctSentence}`);
    this.logger.log(`Correct index: ${correctIndex}`);
    this.logger.log(`Max score: ${maxScore}`);

      return {
        correctSentence: correctSentence || sentences[0],
        correctIndex: correctIndex !== -1 ? correctIndex : 0,
        sentenceScores
      };
  }

  private isValidSentence(sentence: string): boolean {
    // 영어, 숫자 체크를 먼저 하고 한글 체크를 나중에 하도록 순서 변경
    if (/^[a-zA-Z\s]+$/.test(sentence) || /^\d+$/.test(sentence)) {
      return false;
    }
    
    // '올바른 문장을 선택해 주세요' 제외
    if (sentence.includes('올바른 문장을 선택해 주세요')) {
      return false;
    }

    // 한글이 포함된 문장만 유효하다고 판단 
    return /[가-힣]/.test(sentence);
  }


  private async evaluateSentenceWithCache(sentence: string): Promise<EvaluationResult> {
    const cachedResult = this.cache.get(sentence);
    if (cachedResult && Date.now() - cachedResult.timestamp < this.CACHE_TTL) {
      this.logger.log(`Cache hit for sentence: ${sentence}`);
      return cachedResult.result;
    }

    const result = await this.evaluateSentence(sentence);
    this.cache.set(sentence, { result, timestamp: Date.now() });
    return result;
  }

  async evaluateSentence(sentence: string): Promise<EvaluationResult> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "주어진 한국어 문장의 문법적 정확성과 자연스러움을 1부터 100까지의 점수로 평가하세요. 점수만 응답하세요."
            },
            {
              role: "user",
              content: `${sentence}

              단어의 유효성: 모든 단어가 표준국어대사전에 등재된 단어인가요?
              문법적 정확성: 문법 구조(주어, 목적어, 서술어 등 도치법 허용 안 함)가 올바른가요?
              의미의 명확성: 문장이 해석에 혼동 없이 명확하게 전달되나요(문장의 뜻이 모호하지는 않나요?)?
              문장의 자연스러움: 어순, 조사 사용, 단어 선택이 자연스러운가요?
              종합 점수: 1부터 100까지 척도로 전체 문장의 자연스러움과 정확성을 평가해 주세요.`
            }
          ],
          temperature: 0.3,
          max_tokens: 10,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const score = parseInt(response.data.choices[0].message.content.trim(), 10);
      this.logger.log(`Sentence: ${sentence}, Score: ${score}`);
      
      return { score, feedback: '' };
    } catch (error) {
      this.logger.error(`Failed to evaluate sentence: ${error.message}`, error.stack);
      return { score: 0, feedback: "평가 중 오류 발생" };
    }
  }

  // 기존 메서드들과의 호환성을 위해 유지
  async checkGrammar(sentences: string[]): Promise<{ correctSentence: string, correctIndex: number }> {
    const evaluations: EvaluationResult[] = await Promise.all(sentences.map(this.evaluateSentenceWithCache.bind(this)));
    
    let maxScore = -1;
    let bestIndex = 0;
    
    for (let i = 0; i < evaluations.length; i++) {
      if (evaluations[i].score > maxScore) {
        maxScore = evaluations[i].score;
        bestIndex = i;
      }
    }

    return {
      correctSentence: sentences[bestIndex],
      correctIndex: bestIndex
    };
  }

  async findMostNaturalSentenceIndex(sentences: string[]): Promise<number> {
    const evaluations: EvaluationResult[] = await Promise.all(sentences.map(this.evaluateSentenceWithCache.bind(this)));
    
    let maxScore = -1;
    let bestIndex = 0;
    
    for (let i = 0; i < evaluations.length; i++) {
      if (evaluations[i].score > maxScore) {
        maxScore = evaluations[i].score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }
}