import { ConfigService } from "@nestjs/config";
import { GrammarLearning } from "./entities/grammar-Learning.entity";
import { Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class GrammarLearningService {
  private readonly logger = new Logger(GrammarLearningService.name);
  private readonly similarityThreshold = 0.8;

  constructor(
    @InjectRepository(GrammarLearning)
    private learningRepository: Repository<GrammarLearning>
  ) {}

  // calculateSimilarity를 public으로 변경
  public calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    return matrix[str2.length][str1.length];
  }

  // findSimilarCorrection 메서드 추가
  public async findSimilarCorrection(sentences: string[]): Promise<{
    found: boolean;
    correctSentence?: string;
    correctIndex?: number;
    sentenceScores?: number[];
  }> {
    try {
      const similarEntry = await this.findSimilarSentence(sentences[0]);
      
      if (similarEntry) {
        this.logger.debug('Found similar sentence in learned data');
        const correctIndex = sentences.findIndex(s => 
          this.calculateSimilarity(s, similarEntry.correctedText) >= 0.9
        );
        
        if (correctIndex !== -1) {
          return {
            found: true,
            correctSentence: sentences[correctIndex],
            correctIndex,
            sentenceScores: Array(sentences.length).fill(0).map((_, i) => i === correctIndex ? 100 : 0)
          };
        }
      }
      
      return { found: false };
    } catch (error) {
      this.logger.error(`Error finding similar correction: ${error.message}`);
      return { found: false };
    }
  }

  // findSimilarSentence를 private로 유지
  private async findSimilarSentence(text: string): Promise<GrammarLearning | null> {
    const allEntries = await this.learningRepository.find();
    
    for (const entry of allEntries) {
      const similarity = this.calculateSimilarity(text, entry.originalText);
      if (similarity >= this.similarityThreshold) {
        return entry;
      }
    }
    return null;
  }

  public async learnCorrection(
    originalText: string, 
    correctedText: string, 
    alternativeSentences: string[] = [],
    confidence: number = 1.0
  ): Promise<void> {
    try {
      const existingEntry = await this.findSimilarSentence(originalText);

      if (existingEntry) {
        existingEntry.useCount += 1;
        if (confidence > existingEntry.confidence) {
          existingEntry.correctedText = correctedText;
          existingEntry.confidence = confidence;
          existingEntry.alternativeSentences = alternativeSentences;
        }
        await this.learningRepository.save(existingEntry);
      } else {
        const newEntry = this.learningRepository.create({
          originalText,
          correctedText,
          confidence,
          alternativeSentences,
          useCount: 1
        });
        await this.learningRepository.save(newEntry);
      }
    } catch (error) {
      this.logger.error(`Error learning correction: ${error.message}`);
    }
  }
}