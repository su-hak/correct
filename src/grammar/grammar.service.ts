import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { chunk } from 'lodash';

interface EvaluationResult {
  score: number;
  feedback: string;
}

@Injectable()
export class GrammarService {
  private readonly logger = new Logger(GrammarService.name);
  private readonly openaiApiKey: string;
  private readonly MAX_CONCURRENT_REQUESTS = 5;
  private readonly CHUNK_SIZE = 10;

  constructor(private configService: ConfigService) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async findMostNaturalSentence(sentences: string[]): Promise<{ correctSentence: string, correctIndex: number, sentenceScores: number[] }> {
    const filteredSentences = sentences.filter(this.isValidSentence);
    const evaluations = await this.evaluateSentences(filteredSentences);
    const sentenceScores = evaluations.map((evaluation) => evaluation.score);

    const maxScore = Math.max(...sentenceScores);
    const mostNaturalIndex = sentenceScores.indexOf(maxScore);
    const correctSentence = filteredSentences[mostNaturalIndex];

    this.logger.log(`Original sentences: ${sentences.join(', ')}`);
    this.logger.log(`Filtered sentences: ${filteredSentences.join(', ')}`);
    this.logger.log(`Sentence scores: ${sentenceScores.join(', ')}`);
    this.logger.log(`Correct sentence: ${correctSentence}`);
    this.logger.log(`Correct index: ${mostNaturalIndex}`);
    this.logger.log(`Max score: ${maxScore}`);

    return {
      correctSentence: correctSentence || sentences[0],
      correctIndex: sentences.indexOf(correctSentence),
      sentenceScores
    };
  }

  private isValidSentence(sentence: string): boolean {
    if (sentence.includes('올바른 문장을 선택해 주세요')) {
      return false;
    }
    if (/^\d+$/.test(sentence)) {
      return false;
    }
    if (/^[a-zA-Z\s]+$/.test(sentence)) {
      return false;
    }
    return /[가-힣]/.test(sentence);
  }

  private async evaluateSentences(sentences: string[]): Promise<EvaluationResult[]> {
    const chunkedSentences = chunk(sentences, this.CHUNK_SIZE);
    const results = await Promise.all(
      chunkedSentences.map((chunkOfSentences) => this.processChunk(chunkOfSentences))
    );
    return results.flat();
  }

  private async processChunk(sentences: string[]): Promise<EvaluationResult[]> {
    return Promise.all(sentences.map((sentence) => this.evaluateSentence(sentence)));
  }

  public async evaluateSentence(sentence: string): Promise<EvaluationResult> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "당신은 한국어 문법과 어휘 전문가입니다. 주어진 문장을 분석하고 평가해주세요."
            },
            {
              role: "user",
              content: `다음 문장을 분석해주세요: "${sentence}"

              1. 모든 단어가 유효하고 국립국어원의 표준국어대사전에 존재하는 단어인가요?
              2. 문장의 의미가 명확하게 전달되는지, 해석에 혼동이나 모호함이 있지는 않나요?
              3. 조사가 올바르게 쓰이고 어순과 형태가 자연스럽나요?
              4. 전체적으로 의미가 명확하고 자연스러운가요?
              5. 도치법을 사용 하지 않고 정석적인 문장의 어순을 가지고 있나요?
              6. 다음 항목들에 대해 각각 1부터 10까지의 척도로 평가해 주세요:
                a. 문법적 정확성: 문장의 주어, 목적어, 서술어 등 문법 구조가 정확하게 사용되었는지 평가해 주세요.
                b. 의미의 명확성: 문장이 해석할 때 혼동 없이 명확하게 의미가 전달되는지 평가해 주세요.
                c. 문장의 자연스러움: 문장이 자연스럽고, 일상적으로 쓰일 수 있는지 평가해 주세요.
                d. 어휘 선택의 적절성: 사용된 단어들이 문맥에 적합하며, 부자연스럽거나 어색한 단어가 없는지 평가해 주세요.
                e. 전체 점수: 이 문장을 종합적으로 평가했을 때, 1부터 10까지의 척도로 최종 점수를 매겨 주세요.

              각 질문에 대한 설명은 필요 하지 않고, 마지막으로 점수를 알려주세요.`
            }
          ],
          temperature: 0.3,
          max_tokens: 200,
          top_p: 0.95,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content.trim();
      const score = this.extractScoreFromResponse(aiResponse);

      this.logger.log(`Sentence: ${sentence}`);
      this.logger.log(`AI Response: ${aiResponse}`);
      this.logger.log(`Extracted Score: ${score}`);

      return { score, feedback: aiResponse };
    } catch (error) {
      this.logger.error(`Failed to evaluate sentence: ${error.message}`, error.stack);
      return { score: 0, feedback: "평가 중 오류 발생" };
    }
  }

  private extractScoreFromResponse(response: string): number {
    const scoreMatch = response.match(/(\d+(\.\d+)?)\s*점/);
    return scoreMatch ? parseFloat(scoreMatch[1]) : 0;
  }

  async checkGrammar(sentences: string[]): Promise<{ correctSentence: string, correctIndex: number }> {
    const evaluations = await this.evaluateSentences(sentences);

    let maxScore = -1;
    let bestIndex = 0;

    for (let i = 0; i < evaluations.length; i++) {
      if (evaluations[i].score > maxScore) {
        maxScore = evaluations[i].score;
        bestIndex = i;
      }
    }

    return {
      correctSentence: sentences[bestIndex],
      correctIndex: bestIndex
    };
  }

  async findMostNaturalSentenceIndex(sentences: string[]): Promise<number> {
    const evaluations = await this.evaluateSentences(sentences);

    let maxScore = -1;
    let bestIndex = 0;

    for (let i = 0; i < evaluations.length; i++) {
      if (evaluations[i].score > maxScore) {
        maxScore = evaluations[i].score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }
}