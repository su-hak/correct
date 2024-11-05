import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';

@Injectable()
export class GrammarService {
  private readonly openaiApiKey: string;
  private readonly agent: https.Agent;
  private cache = new Map<string, number>();

  constructor(private configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.agent = new https.Agent({
      keepAlive: true,
      maxSockets: 1
    });
  }

  private hashSentences(sentences: string[]): string {
    return sentences.join('|');
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    try {
      // 1. 캐시 확인
      const cacheKey = this.hashSentences(sentences);
      if (this.cache.has(cacheKey)) {
        const cachedIndex = this.cache.get(cacheKey)!;
        return {
          correctSentence: sentences[cachedIndex],
          correctIndex: cachedIndex,
          sentenceScores: Array(sentences.length).fill(0)
            .map((_, i) => i === cachedIndex ? 100 : 0)
        };
      }

      // 2. GPT 요청
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "주어진 문장들 중 가장 자연스럽고 맞춤법이 정확한 문장의 인덱스만 숫자로 답하세요. 기준은 다음과 같습니다:\n1. 맞춤법이 정확한가\n2. 주어+목적어+서술어 순서가 맞는가\n3. 도치법이 없는가\n4. 조사와 어미가 올바른가"
            },
            {
              role: "user",
              content: `가장 맞춤법이 정확한 문장의 번호:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
            }
          ],
          temperature: 0,
          max_tokens: 1,
          presence_penalty: -2.0,
          frequency_penalty: -2.0
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip',
            'Connection': 'keep-alive'
          },
          httpAgent: this.agent,
          timeout: 1000,
          decompress: true
        }
      );

      const index = parseInt(response.data.choices[0].message.content.trim());
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length 
        ? index 
        : sentences.length - 1;

      // 3. 캐시 저장
      this.cache.set(cacheKey, validIndex);

      return {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: Array(sentences.length).fill(0)
          .map((_, i) => i === validIndex ? 100 : 0)
      };

    } catch (error) {
      // 4. 에러 시 휴리스틱 분석
      const bestIndex = this.analyzeWithHeuristics(sentences);
      return {
        correctSentence: sentences[bestIndex],
        correctIndex: bestIndex,
        sentenceScores: Array(sentences.length).fill(0)
          .map((_, i) => i === bestIndex ? 100 : 0)
      };
    }
  }

  private analyzeWithHeuristics(sentences: string[]): number {
    const scores = sentences.map((sentence, index) => {
      let score = 0;
      
      // 기본 문법 점수
      if (sentence.match(/[.!?]$/)) score += 10;
      if (sentence.match(/^[가-힣]/)) score += 10;
      if (!sentence.match(/[a-zA-Z]/)) score += 10;
      
      // 조사 사용
      if (sentence.match(/[은는이가을를]/)) score += 20;
      
      // 띄어쓰기
      if (sentence.includes(' ')) score += 20;
      
      // 문장 구조
      if (sentence.match(/[이가] .+[다요]/)) score += 10;
      
      return { index, score };
    });

    return scores.reduce((max, curr) => 
      curr.score > scores[max].score ? curr.index : max, 0
    );
  }
}