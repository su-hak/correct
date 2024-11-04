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
      const numberedSentences = sentences.map((s, i) => `${i}. ${s.trim()}`).join('\n');
      
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "당신은 한국어 맞춤법 전문가입니다. 문장의 자연스러움과 문법을 평가하세요."
            },
            {
              role: "user",
              content: `다음 중 가장 자연스럽고 문법적으로 올바른 문장의 번호만 숫자로 답하세요.
각 문장에서 다음을 평가합니다:
1. 주어, 목적어, 서술어의 순서가 올바른가? (도치는 올바르지 않음)
2. 맞춤법이 정확한가?
3. 조사가 올바르게 사용되었는가?

${numberedSentences}

답변은 번호만 입력하세요.`
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

      let index = parseInt(response.data.choices[0].message.content.trim());
      
      // 응답 검증
      if (isNaN(index) || index < 0 || index >= sentences.length) {
        // 재시도: 더 명확한 프롬프트로
        const retryResponse = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "정확한 숫자로만 답하세요."
              },
              {
                role: "user",
                content: `다음 문장들 중에서 가장 자연스럽고 문법적으로 맞는 문장의 번호만 숫자로 답하세요:\n${numberedSentences}\n\n0부터 ${sentences.length-1} 사이의 숫자 하나만 답하세요.`
              }
            ],
            temperature: 0,
            max_tokens: 1
          },
          {
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 2000
          }
        );
        
        index = parseInt(retryResponse.data.choices[0].message.content.trim());
      }

      // 최종 검증
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : 0;

      return {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === validIndex ? 100 : 0)
      };

    } catch (error) {
      this.logger.error(`Failed to evaluate sentences: ${error.message}`);
      throw error;
    }
  }
}