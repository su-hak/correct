// openai.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class OpenAiService {
  constructor(private configService: ConfigService) {}

  async checkGrammar(text: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const url = 'https://api.openai.com/v1/chat/completions';

    try {
      const response = await axios.post(
        url,
        {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: '당신은 한국어 문법 전문가 입니다. 주어진 문장의 문법을 검사 하고, 문법 적으로 올바른 문장을 고르 세요.',
            },
            { role: 'user', content: `다음 문장의 문법을 검사 해 주세요: ${text}` },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI API 호출 중 오류 발생:', error);
      throw new Error('문법 검사 중 오류가 발생했습니다.');
    }
  }
}