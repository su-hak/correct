import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GrammarLearningService } from './grammar-Learning.service';

@Injectable()
export class GrammarService {
  private readonly openaiApiKey: string;
  private readonly logger = new Logger(GrammarService.name);

  constructor(
    private configService: ConfigService,
    private grammarLearningService: GrammarLearningService
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    try {
      this.logger.log(`Starting grammar analysis for ${sentences.length} sentences`);
      this.logger.debug('Input sentences:', sentences);

      // 학습 데이터 먼저 확인
      this.logger.log('Checking learning database for similar corrections');
      const learningResult = await this.grammarLearningService.findSimilarCorrection(sentences);
      
      if (learningResult.found) {
        this.logger.log(`Found matching correction in learning database: "${learningResult.correctSentence}"`);
        this.logger.debug('Learning result details:', {
          correctIndex: learningResult.correctIndex,
          scores: learningResult.sentenceScores
        });
        
        return {
          correctSentence: learningResult.correctSentence!,
          correctIndex: learningResult.correctIndex!,
          sentenceScores: learningResult.sentenceScores!
        };
      }

      // OpenAI API 호출
      this.logger.log('No matching correction found in database, calling OpenAI API');
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "주어진 문장들 중 가장 자연스럽고 맞춤법이 정확한 문장의 인덱스만 숫자로 답하세요. 기준은 다음과 같습니다:\n1. 맞춤법이 정확한가\n2. 주어+목적어+서술어 순서가 맞는가\n3. 도치법이 없는가\n4. 조사와 어미가 올바른가"
            },
            {
              role: "user",
              content: `아래 문장 중에서 가장 자연스러운 문장의 번호만 답하세요:\n${sentences.map((s, i) => `${i}. ${s}`).join('\n')}`
            }
          ],
          temperature: 0,
          max_tokens: 1,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000 
        }
      );

      const index = parseInt(response.data.choices[0].message.content.trim());
      const validIndex = !isNaN(index) && index >= 0 && index < sentences.length ? index : 0;

      this.logger.log(`OpenAI API returned index ${index}, validated index: ${validIndex}`);
      this.logger.debug('Selected correct sentence:', sentences[validIndex]);

      // 비동기로 학습 처리
      this.logger.log('Starting asynchronous learning process');
      this.grammarLearningService.learnCorrection(
        sentences[validIndex],
        sentences
      ).catch(err => {
        this.logger.error('Learning process failed:', err);
        this.logger.error('Failed learning data:', {
          correctSentence: sentences[validIndex],
          inputSentences: sentences
        });
      });

      const result = {
        correctSentence: sentences[validIndex],
        correctIndex: validIndex,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === validIndex ? 100 : 0)
      };

      this.logger.log('Grammar analysis completed successfully');
      this.logger.debug('Final result:', result);

      return result;

    } catch (error) {
      this.logger.error(`Error in grammar analysis: ${error.message}`);
      this.logger.error('Error details:', {
        error: error,
        inputSentences: sentences
      });
      
      const fallbackResult = {
        correctSentence: sentences[0],
        correctIndex: 0,
        sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === 0 ? 100 : 0)
      };

      this.logger.warn('Returning fallback result:', fallbackResult);
      return fallbackResult;
    }
  }
}