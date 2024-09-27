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

    try {
      const prompt = `다음 5개의 문장 중에서 문법적으로 정확한 문장을 찾아주세요:
      1. ${sentences[0]}
      2. ${sentences[1]}
      3. ${sentences[2]}
      4. ${sentences[3]}
      5. ${sentences[4]}
      
      정확한 문장 번호와 그 문장만을 "정확한 문장: [번호]. [문장]" 형식으로 답변해주세요.`;

      const response = await this.callOpenAI(openaiApiKey, prompt);
      const { correctSentence } = this.parseCorrectSentence(response);

      this.logger.log(`Correct sentence found: ${correctSentence}`);
      return { correctSentence };
    } catch (error) {
      this.logger.error('Error during grammar check:', error.stack);
      throw new Error('문법 검사 중 오류가 발생했습니다.');
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
      const grammarCheckPrompt = `다음 5개의 문장 중에서 문법적으로 정확한 문장을 찾아주세요:
      1. ${extractedSentences[0]}
      2. ${extractedSentences[1]}
      3. ${extractedSentences[2]}
      4. ${extractedSentences[3]}
      5. ${extractedSentences[4]}
      
      정확한 문장 번호와 그 문장만을 "정확한 문장: [번호]. [문장]" 형식으로 답변해주세요.`;

      const grammarCheckResponse = await this.callOpenAI(openaiApiKey, grammarCheckPrompt);
      const { correctSentence, correctIndex } = this.parseCorrectSentence(grammarCheckResponse);

      this.logger.log(`Correct sentence found: ${correctSentence} at index ${correctIndex}`);
      return { correctSentence, correctIndex };
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

  private parseCorrectSentence(response: string): { correctSentence: string, correctIndex: number } {
    const match = response.match(/정확한 문장:\s*(\d+)\.\s*(.*)/);
    if (match) {
      return {
        correctIndex: parseInt(match[1]) - 1,
        correctSentence: match[2].trim()
      };
    }
    throw new Error('올바른 문장을 찾을 수 없습니다.');
  }
}