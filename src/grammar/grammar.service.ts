import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GrammarLearningService } from './grammar-Learning.service';

@Injectable()
export class GrammarService {
  private readonly openaiApiKey: string;

  private readonly logger = new Logger(GrammarService.name);

  constructor(
    private configService: ConfigService,
    private grammarLearningService: GrammarLearningService
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    try {
      // 학습 데이터 검색 시도 중 에러가 나도 계속 진행
      try {
        const learningResult = await this.grammarLearningService.findSimilarCorrection(sentences);
        if (learningResult.found) {
          return {
            correctSentence: learningResult.correctSentence!,
            correctIndex: learningResult.correctIndex!,
            sentenceScores: learningResult.sentenceScores!
          };
        }
      } catch (err) {
        this.logger.warn('Learning service error, proceeding with OpenAI:', err.message);
      }

      // 학습된 데이터에 없는 경우 OpenAI API 호출
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
              content: `아래 문장 중에서 가장 자연스럽고 올바른 문장의 번호만 답하세요:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
            }
          ],
          temperature: 0,
          max_tokens: 1,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      const index = parseInt(response.data.choices[0].message.content.trim());
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : sentences.length - 1;

      // 결과 학습
      await this.grammarLearningService.learnCorrection(
        sentences[0],
        sentences[validIndex],
        sentences,
        1.0
      );

      return {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === validIndex ? 100 : 0)
      };

    } catch (error) {
      this.logger.error(`Error in grammar analysis: ${error.message}`);
      const lastIndex = sentences.length - 1;
      return {
        correctSentence: sentences[lastIndex],
        correctIndex: lastIndex,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === lastIndex ? 100 : 0)
      };
    }
  }
}