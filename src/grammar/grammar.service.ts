import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);
  
  constructor(private configService: ConfigService) {}

  async checkGrammar(sentences: string[]): Promise<{ correctSentence: string }> {
    this.logger.log(`Checking grammar for sentences: ${sentences}`);
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');

    const prompt = `다음 5개의 문장 중에서 문법적으로 정확한 문장을 찾아주세요:
    1. ${sentences[0]}
    2. ${sentences[1]}
    3. ${sentences[2]}
    4. ${sentences[3]}
    5. ${sentences[4]}
    
    정확한 문장 번호와 그 문장만을 "정확한 문장: [번호]. [문장]" 형식으로 답변해주세요.`;

    try {
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
      const correctSentence = answer.replace('정확한 문장: ', '').split('. ')[1];

      this.logger.log(`Correct sentence found: ${correctSentence}`);
      return { correctSentence };
    } catch (error) {
      this.logger.error('Error during grammar check:', error.stack);
      throw new Error('문법 검사 중 오류가 발생했습니다.');
    }
  }
}