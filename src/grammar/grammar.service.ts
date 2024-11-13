import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);
  private readonly openaiApiKey: string;

  constructor(
    private configService: ConfigService,
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    try {
      this.logger.debug('Input sentences:', sentences);

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
              content: `아래 문장 중에서 가장 자연스러운 문장의 번호만 답하세요:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
            }
          ],
          temperature: 0,
          max_tokens: 1,
          presence_penalty: 0,
          frequency_penalty: 0,
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
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : 0;

      return {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: sentences.map((_, i) => i === validIndex ? 100 : 0)
      };

    } catch (error) {
      this.logger.error('Error in findMostNaturalSentence:', error);
      return {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: sentences.map((_, i) => i === 0 ? 100 : 0)
      };
    }
  }
}