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
              content: `다음 문장을 분석해주세요(설명은 필요 없어요.): "${sentence}"

              단어의 유효성: 모든 단어가 표준국어대사전에 등재된 단어인가요?
              문법적 정확성: 문법 구조(주어, 목적어, 서술어 등 도치법 허용 안 함)가 올바른가요?
              의미의 명확성: 문장이 해석에 혼동 없이 명확하게 전달되나요?
              문장의 자연스러움: 어순, 조사 사용, 단어 선택이 자연스러운가요?
              종합 점수: 1부터 10까지 척도로 전체 문장의 자연스러움과 정확성을 평가해 주세요.`
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