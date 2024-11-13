import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GrammarLearningService } from './grammar-Learning.service';
import { PerformanceLogger } from 'src/performance_Logger';

interface GrammarResult {
  correctSentence: string;
  correctIndex: number;
  sentenceScores: number[];
  confidence: number;
}

interface LearningResult {
  found: boolean;
  correctSentence?: string;
  correctIndex?: number;
  sentenceScores?: number[];
}

@Injectable()
export class GrammarService {
  private readonly openaiApiKey: string;
  private readonly logger = new Logger(GrammarService.name);
  private readonly minimumConfidenceScore = 70;

  constructor(
    private configService: ConfigService,
    private grammarLearningService: GrammarLearningService
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<GrammarResult> {
    try {
      if (!this.validateInput(sentences)) {
        return this.getFallbackResult(sentences);
      }

      const cleanedSentences = sentences.map(s => this.cleanSentence(s));
      this.logger.debug('Cleaned sentences:', cleanedSentences);

      const learningResult = await this.checkLearningData(cleanedSentences);
      if (learningResult.found && learningResult.correctSentence) {
        return {
          correctSentence: learningResult.correctSentence,
          correctIndex: learningResult.correctIndex || 0,
          sentenceScores: learningResult.sentenceScores || sentences.map((_, i) => i === 0 ? 100 : 0),
          confidence: 85
        };
      }

      const aiResult = await this.analyzeWithOpenAI(cleanedSentences);
      const finalResult = this.validateAndNormalizeResult(aiResult, cleanedSentences);

      await this.updateLearningData(finalResult, cleanedSentences);

      return finalResult;
    } catch (error) {
      this.logger.error('Error in findMostNaturalSentence:', error);
      return this.getFallbackResult(sentences);
    }
  }

  private validateInput(sentences: string[]): boolean {
    if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
      this.logger.error('Empty or invalid sentences array');
      return false;
    }

    if (sentences.some(s => typeof s !== 'string')) {
      this.logger.error('Non-string elements in sentences array');
      return false;
    }

    if (sentences.length < 2) {
      this.logger.error('Not enough sentences for comparison');
      return false;
    }

    return true;
  }

  private cleanSentence(sentence: string): string {
    return sentence
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\.,!? ]/g, '');
  }

  private async checkLearningData(sentences: string[]): Promise<LearningResult> {
    return this.grammarLearningService.findSimilarCorrection(sentences);
  }

  private async analyzeWithOpenAI(sentences: string[]): Promise<any> {
    const prompt = this.buildPrompt(sentences);
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "한국어 문법 전문가로서 주어진 문장들 중 가장 자연스럽고 문법적으로 올바른 문장을 선택하세요."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 50,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      }
    );

    return response.data;
  }

  private buildPrompt(sentences: string[]): string {
    return `다음 문장들 중에서 가장 자연스럽고 문법적으로 올바른 문장의 번호를 선택하세요:
${sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')}

응답 형식: 숫자만 입력`;
  }

  private validateAndNormalizeResult(aiResult: any, sentences: string[]): GrammarResult {
    const index = parseInt(aiResult.choices?.[0]?.message?.content?.trim() ?? '1') - 1;
    const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : 0;

    return {
      correctSentence: sentences[validIndex],
      correctIndex: validIndex,
      sentenceScores: sentences.map((_, i) => i === validIndex ? 100 : 0),
      confidence: 85
    };
  }

  private async updateLearningData(result: GrammarResult, sentences: string[]): Promise<void> {
    try {
      await this.grammarLearningService.learnCorrection(
        result.correctSentence,
        sentences
      );
    } catch (error) {
      this.logger.error('Learning update error:', error);
    }
  }

  private getFallbackResult(sentences: string[]): GrammarResult {
    return {
      correctSentence: sentences[0],
      correctIndex: 0,
      sentenceScores: sentences.map((_, i) => i === 0 ? 100 : 0),
      confidence: 50
    };
  }
}