import { ConfigService } from "@nestjs/config";
import { GrammarLearning } from "./entities/grammar-Learning.entity";
import { MoreThan, Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class GrammarLearningService {
  private readonly logger = new Logger(GrammarLearningService.name);
  private readonly similarityThreshold = 0.8;
  private readonly cache = new Map<string, GrammarLearning>();
  private readonly frequentPatterns = new Map<string, string>();

  constructor(
    @InjectRepository(GrammarLearning)
    private learningRepository: Repository<GrammarLearning>
  ) {
    this.initializeCache();
  }

  private async initializeCache() {
    try {
      // 자주 사용되는 항목만 캐싱
      const frequentEntries = await this.learningRepository.find({
        where: { useCount: MoreThan(5) },
        order: { useCount: 'DESC' },
        take: 1000
      });

      frequentEntries.forEach(entry => {
        this.cache.set(this.generateKey(entry.originalText), entry);
        // 패턴 캐싱
        this.frequentPatterns.set(
          this.generatePattern(entry.originalText),
          entry.correctedText
        );
      });
    } catch (error) {
      this.logger.error('Cache initialization failed:', error);
    }
  }

  private generateKey(text: string): string {
    return text.replace(/\s+/g, '').toLowerCase();
  }

  private generatePattern(text: string): string {
    return text
      .replace(/[은는이가을를에서도의로]\s*/g, '*')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public async findSimilarCorrection(sentences: string[]): Promise<{
    found: boolean;
    correctSentence?: string;
    correctIndex?: number;
    sentenceScores?: number[];
  }> {
    try {
      const originalText = sentences[0];
      const key = this.generateKey(originalText);
      const pattern = this.generatePattern(originalText);

      // 1. 캐시에서 직접 매치 확인
      const cachedEntry = this.cache.get(key);
      if (cachedEntry) {
        return this.createResponse(sentences, cachedEntry);
      }

      // 2. 패턴 매칭
      const patternMatch = this.frequentPatterns.get(pattern);
      if (patternMatch) {
        const correctIndex = sentences.findIndex(s => 
          this.generateKey(s) === this.generateKey(patternMatch)
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

      // 3. DB에서 빠른 검색
      const similarEntry = await this.learningRepository
        .createQueryBuilder('grammar')
        .where('LOWER(grammar.originalText) LIKE :pattern', { 
          pattern: `%${pattern.replace(/\*/g, '%')}%` 
        })
        .orderBy('grammar.useCount', 'DESC')
        .getOne();

      if (similarEntry) {
        // 캐시에 추가
        this.cache.set(key, similarEntry);
        return this.createResponse(sentences, similarEntry);
      }

      return { found: false };
    } catch (error) {
      this.logger.error(`Error finding similar correction: ${error.message}`);
      return { found: false };
    }
  }

  private createResponse(sentences: string[], entry: GrammarLearning) {
    const correctIndex = sentences.findIndex(s => 
      this.generateKey(s) === this.generateKey(entry.correctedText)
    );

    if (correctIndex !== -1) {
      return {
        found: true,
        correctSentence: sentences[correctIndex],
        correctIndex,
        sentenceScores: Array(sentences.length).fill(0)
          .map((_, i) => i === correctIndex ? 100 : 0)
      };
    }

    return { found: false };
  }

  public async learnCorrection(
    originalText: string,
    correctedText: string,
    alternativeSentences: string[] = [],
    confidence: number = 1.0
  ): Promise<void> {
    const key = this.generateKey(originalText);
    const pattern = this.generatePattern(originalText);

    try {
      let entry = this.cache.get(key);
      if (!entry) {
        entry = await this.learningRepository.findOne({
          where: { originalText }
        });
      }

      if (entry) {
        entry.useCount += 1;
        if (confidence > entry.confidence) {
          entry.correctedText = correctedText;
          entry.confidence = confidence;
          entry.alternativeSentences = alternativeSentences;
        }
      } else {
        entry = this.learningRepository.create({
          originalText,
          correctedText,
          confidence,
          alternativeSentences,
          useCount: 1
        });
      }

      const savedEntry = await this.learningRepository.save(entry);
      this.cache.set(key, savedEntry);
      this.frequentPatterns.set(pattern, correctedText);

    } catch (error) {
      this.logger.error(`Error learning correction: ${error.message}`);
    }
  }
}