import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);
  private readonly openaiApiKey: string;

  constructor(private configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
  }

  async checkGrammar(sentences: string[]): Promise<{ correctSentence: string, correctIndex: number }> {
    for (let i = 0; i < sentences.length; i++) {
      if (await this.isCorrectGrammar(sentences[i])) {
        return { correctSentence: sentences[i], correctIndex: i };
      }
    }
    // 모든 문장이 부적절할 경우 첫 번째 문장 반환
    return { correctSentence: sentences[0], correctIndex: 0 };
  }

  private async isCorrectGrammar(sentence: string): Promise<boolean> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "당신은 한국어 문법 전문가입니다. 주어진 문장이 문법적으로 올바르고 자연스러운지 판단해주세요."
            },
            {
              role: "user",
              content: `다음 문장이 문법적으로 올바르고 자연스러운지 판단해주세요: "${sentence}" 만약 올바르다면 "올바름"이라고만 답변하고, 그렇지 않다면 "올바르지 않음"이라고만 답변해주세요.`
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
      return aiResponse === "올바름";
    } catch (error) {
      this.logger.error(`Failed to check grammar: ${error.message}`, error.stack);
      return false;
    }
  }

  async extractAndCheckGrammar(imageDescription: string): Promise<{ correctSentence: string, correctIndex: number }> {
    this.logger.log(`Extracting sentences and checking grammar for image description`);
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');

    try {
      // 1. 이미지 설명에서 문장 추출
      const extractionPrompt = `다음 이미지 설명에서 정확히 5개의 문장을 추출해주세요:
      ${imageDescription}
      
      각 문장을 번호를 붙여 나열해주세요.`;

      const extractionResponse = await this.callOpenAI(openaiApiKey, extractionPrompt);
      const extractedSentences = this.parseSentences(extractionResponse);

      // 2. 추출된 문장들 중 문법적으로 정확한 문장 찾기
      return this.checkGrammar(extractedSentences);
    } catch (error) {
      this.logger.error('Error during sentence extraction and grammar check:', error.stack);
      throw new Error('문장 추출 및 문법 검사 중 오류가 발생했습니다.');
    }
  }

  private async callOpenAI(apiKey: string, prompt: string): Promise<string> {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return response.data.choices[0].message.content.trim();
  }

  private parseSentences(response: string): string[] {
    return response.split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map(line => line.replace(/^\d+\.\s*/, '').trim());
  }
}