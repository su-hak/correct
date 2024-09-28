import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GrammarService {
  constructor(private configService: ConfigService) {}

  async checkGrammar(sentences: string[]): Promise<{ correctSentence: string, correctIndex: number }> {
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');

    const prompt = `다음 5개의 문장 중에서 문법적으로 정확한 문장을 찾아주세요:
    1. ${sentences[0]}
    2. ${sentences[1]}
    3. ${sentences[2]}
    4. ${sentences[3]}
    5. ${sentences[4]}
    
    정확한 문장 번호와 그 문장만을 "정확한 문장: [번호]. [문장]" 형식으로 답변해주세요.`;

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const answer = response.data.choices[0].message.content.trim();
    const match = answer.match(/정확한 문장:\s*(\d+)\.\s*(.*)/);
    if (match) {
      return {
        correctIndex: parseInt(match[1]) - 1,
        correctSentence: match[2].trim()
      };
    }
    throw new Error('올바른 문장을 찾을 수 없습니다.');
  }
}