import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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
    if (!sentences?.length) {
      return { correctSentence: '', correctIndex: -1, sentenceScores: [] };
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "user",
              content: `다음 문장들 중에서 맞춤법이 정확하고, 주어+목적어+서술어 순서가 올바르며(도치 불가), 조사와 어미가 올바르게 사용된 가장 자연스러운 문장의 번호만 숫자로 답하세요:
${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
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
          timeout: 2000
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
      return {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: Array(sentences.length).fill(0)
      };
    }
  }
}