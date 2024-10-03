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

  async findMostNaturalSentence(sentences: string[]): Promise<{ correctSentence: string, correctIndex: number }> {
    const filteredSentences = sentences.filter(this.isValidSentence);
    
    let maxScore = -1;
    let mostNaturalIndex = -1;
    let correctSentence = '';

    for (let i = 0; i < filteredSentences.length; i++) {
      const result = await this.evaluateSentenceWithCache(filteredSentences[i]);
      if (result.score > maxScore) {
        maxScore = result.score;
        mostNaturalIndex = sentences.indexOf(filteredSentences[i]);  // 원래 배열에서의 인덱스를 찾습니다
        correctSentence = filteredSentences[i];
      }
    }

    // 로깅 추가
    this.logger.log(`Original sentences: ${sentences.join(', ')}`);
    this.logger.log(`Filtered sentences: ${filteredSentences.join(', ')}`);
    this.logger.log(`Correct sentence: ${correctSentence}`);
    this.logger.log(`Correct index: ${mostNaturalIndex}`);

    return {
      correctSentence: correctSentence || sentences[0],  // 유효한 문장이 없을 경우 첫 번째 문장 반환
      correctIndex: mostNaturalIndex !== -1 ? mostNaturalIndex : 0
    };
  }

  private isValidSentence(sentence: string): boolean {
    // '올바른 문장을 선택해 주세요' 제외
    if (sentence.includes('올바른 문장을 선택해 주세요')) {
      return false;
    }
    
    // 숫자만 있는 문장 제외
    if (/^\d+$/.test(sentence)) {
      return false;
    }
    
    // 영어만 있는 문장 제외
    if (/^[a-zA-Z\s]+$/.test(sentence)) {
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
              content: "당신은 한국어 문법과 어휘 전문가입니다. 주어진 문장을 분석하고 평가해주세요."
            },
            {
              role: "user",
              content: `다음 문장을 분석해주세요(설명은 필요 없어요.): "${sentence}"

              단어의 유효성: 모든 단어가 표준국어대사전에 등재된 단어인가요?
              문법적 정확성: 문법 구조(주어, 목적어, 서술어 등 도치법 허용 안 함)가 올바른가요?
              의미의 명확성: 문장이 해석에 혼동 없이 명확하게 전달되나요?
              문장의 자연스러움: 어순, 조사 사용, 단어 선택이 자연스러운가요?
              종합 점수: 1부터 100까지 척도로 전체 문장의 자연스러움과 정확성을 평가해 주세요.`
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content.trim();
      const score = this.extractScoreFromResponse(aiResponse);

      this.logger.log(`Sentence: ${sentence}`);
      this.logger.log(`AI Response: ${aiResponse}`);
      this.logger.log(`Extracted Score: ${score}`);
      
      return { score, feedback: aiResponse };
    } catch (error) {
      this.logger.error(`Failed to evaluate sentence: ${error.message}`, error.stack);
      return { score: 0, feedback: "평가 중 오류 발생" };
    }
  }

  private extractScoreFromResponse(response: string): number {
    const scoreMatch = response.match(/(\d+)(?=\s*점)/);
    return scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
  }

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