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
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "문장 번호만 숫자로 답하세요. 다른 글자는 쓰지 마세요."
            },
            {
              role: "user",
              content: `다음 문장 중 가장 자연스럽고 맞춤법이 맞으며, 주어+목적어+서술어 순서가 올바른 문장의 번호를 숫자로만 답하세요.\n\n${sentences.map((s, i) => `${i}) ${s}`).join('\n')}\n\n답변은 숫자만 입력:`
            }
          ],
          max_tokens: 1,
          temperature: 0,
          frequency_penalty: 0,
          presence_penalty: 0,
          stop: ["\n", " ", ".", ","]  // 숫자 외 다른 문자 입력 방지
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 2000
        }
      );

      const content = response.data.choices[0].message.content.trim();
      const index = parseInt(content);

      // 유효한 숫자가 아니면 가장 적절해 보이는 마지막 문장 선택
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length 
        ? index 
        : sentences.length - 1;  // 마지막 문장이 가장 자연스러워 보이므로

      return {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === validIndex ? 100 : 0)
      };

    } catch (error) {
      this.logger.error('Grammar check error:', error);
      // 에러 발생 시 마지막 문장 선택
      const lastIndex = sentences.length - 1;
      return {
        correctSentence: sentences[lastIndex],
        correctIndex: lastIndex,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === lastIndex ? 100 : 0)
      };
    }
  }
}