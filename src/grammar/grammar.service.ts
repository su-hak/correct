import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as https from 'https';

interface EvaluationResult {
  score: number;
  feedback: string;
}

interface CacheEntry {
  result: EvaluationResult;
  timestamp: number;
}

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);
  private readonly openaiApiKey: string;
  private readonly apiEndpoint = 'https://api.openai.com/v1/chat/completions';

  constructor(private configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    if (!sentences?.length) return this.getDefaultResponse();

    try {
      const agent = new https.Agent({
        keepAlive: true,
        maxSockets: 1
      });

      const response = await axios({
        method: 'post',
        url: this.apiEndpoint,
        data: {
          model: "gpt-3.5-turbo",
          messages: [{
            role: "user",
            content: `맞춤법, 주어+목적어+서술어 순서(도치불가), 조사와 어미 사용이 가장 올바른 문장의 번호만 답하세요:\n${sentences.map((s,i) => `${i}. ${s}`).join('\n')}`
          }],
          max_tokens: 1,
          temperature: 0,
          stream: false,
          presence_penalty: 0,
          frequency_penalty: 0
        },
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json',
          'Connection': 'keep-alive'
        },
        timeout: 1800,
        responseType: 'json',
        httpAgent: agent,
        transitional: { silentJSONParsing: true }
      });

      const index = parseInt(response.data.choices[0].message.content);
      return this.createResponse(sentences, isNaN(index) ? 0 : index);
      
    } catch (error) {
      const firstIndex = 0;
      return this.createResponse(sentences, firstIndex);
    }
  }

  private getDefaultResponse() {
    return {
      correctSentence: '',
      correctIndex: -1,
      sentenceScores: []
    };
  }

  private createResponse(sentences: string[], index: number) {
    return {
      correctSentence: sentences[index],
      correctIndex: index,
      sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === index ? 100 : 0)
    };
  }
}