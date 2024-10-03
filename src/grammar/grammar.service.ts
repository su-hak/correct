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
      sentenceScores: sentenceScores.map(score => parseFloat(score.toFixed(2)))
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

  async evaluateSentences(sentences: string[]): Promise<EvaluationResult[]> {
    const chunkedSentences = chunk(sentences, this.CHUNK_SIZE);
    const results = await Promise.all(
      chunkedSentences.map(chunk => this.processChunk(chunk))
    );
    return results.flat();
  }

  private async processChunk(sentences: string[]): Promise<EvaluationResult[]> {
    return Promise.all(sentences.map(sentence => this.evaluateSentence(sentence)));
  }

  public async evaluateSentence(sentence: string): Promise<EvaluationResult> {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a Korean language expert. Analyze the given sentence and provide a score and feedback."
            },
            {
              role: "user",
              content: `Analyze this Korean sentence: "${sentence}"
              
              Provide:
              1. A score from 1 to 10 (1 being poorest, 10 being perfect) based on grammar, clarity, and naturalness.
              2. A brief explanation for the score in Korean.
              
              Response format:
              Score: [Your score]
              Feedback: [Your explanation in Korean]`
            }
          ],
          temperature: 0.3,
          max_tokens: 150,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content.trim();
      const { score, feedback } = this.extractScoreAndFeedback(aiResponse);

      this.logger.log(`Sentence: ${sentence}`);
      this.logger.log(`AI Response: ${aiResponse}`);
      this.logger.log(`Extracted Score: ${score}`);

      return { score, feedback };
    } catch (error) {
      this.logger.error(`Failed to evaluate sentence: ${error.message}`, error.stack);
      return { score: 0, feedback: "평가 중 오류 발생" };
    }
  }

  private extractScoreAndFeedback(response: string): { score: number, feedback: string } {
    const scoreMatch = response.match(/Score:\s*(\d+)/i);
    const feedbackMatch = response.match(/Feedback:\s*([\s\S]+)/i);

    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    const feedback = feedbackMatch ? feedbackMatch[1].trim() : "피드백을 추출할 수 없습니다.";

    return { score, feedback };
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