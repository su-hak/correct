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
      this.logger.debug('Input sentences:', sentences);
      
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "한국어 문법 검사기입니다. 정확한 답변만 하세요."
            },
            {
              role: "user",
              content: `아래 문장들을 평가하고 가장 올바른 문장의 번호만 숫자로 답하세요:
평가기준:
1. 맞춤법이 정확한가?
2. 주어+목적어+서술어 순서가 맞는가?
3. 도치법이 없는가?
4. 조사와 어미가 올바른가?

${sentences.map((s, i) => `${i}. ${s.trim()}`).join('\n')}

답변은 0부터 ${sentences.length - 1} 사이의 숫자만 입력하세요.`
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
          timeout: 2000
        }
      );

      let responseContent = response.data.choices[0].message.content.trim();
      this.logger.debug('Raw GPT Response:', responseContent);

      // 숫자만 추출
      const numberMatch = responseContent.match(/\d+/);
      if (!numberMatch) {
        this.logger.warn('No number found in GPT response');
        return this.getDefaultResponse(sentences);
      }

      const index = parseInt(numberMatch[0]);
      this.logger.debug('Parsed index:', index);

      // 인덱스 유효성 검사
      if (isNaN(index) || index < 0 || index >= sentences.length) {
        this.logger.warn('Invalid index:', index);
        return this.getDefaultResponse(sentences);
      }

      const result = {
        correctSentence: sentences[index],
        correctIndex: index,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === index ? 100 : 0)
      };

      this.logger.debug('Final result:', result);
      return result;

    } catch (error) {
      this.logger.error('Grammar check error:', error);
      return this.getDefaultResponse(sentences);
    }
  }

  private getDefaultResponse(sentences: string[]) {
    return {
      correctSentence: sentences[0],
      correctIndex: 0,
      sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === 0 ? 100 : 0)
    };
  }
}