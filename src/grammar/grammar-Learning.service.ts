import { ConfigService } from "@nestjs/config";
import { GrammarLearning } from "./entities/grammar-Learning.entity";
import { MoreThan, Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class GrammarLearningService {
  private readonly logger = new Logger(GrammarLearningService.name);
  private readonly cache = new Map<string, GrammarLearning>();
  private readonly patternCache = new Map<string, GrammarLearning>();

  constructor(
    @InjectRepository(GrammarLearning)
    private learningRepository: Repository<GrammarLearning>
  ) {
    this.initializeCache();
  }

  private async initializeCache() {
    try {
      const allEntries = await this.learningRepository.find({
        order: { useCount: 'DESC' }
      });

      allEntries.forEach(entry => {
        // 정확한 매치를 위한 캐시
        const exactKey = this.generateExactKey(entry.originalText);
        this.cache.set(exactKey, entry);

        // 패턴 매치를 위한 캐시
        const patternKey = this.generatePatternKey(entry.originalText);
        this.patternCache.set(patternKey, entry);
      });

      this.logger.log(`Cache initialized with ${allEntries.length} entries`);
    } catch (error) {
      this.logger.error('Cache initialization failed:', error);
    }
  }

  private generateExactKey(text: string): string {
    return text
      .replace(/\s+/g, '')  // 공백 제거
      .toLowerCase();       // 소문자 변환
  }

  private generatePatternKey(text: string): string {
    return text
      .replace(/[은는이가을를에서도의로]\s*/g, '') // 조사 제거
      .replace(/[.,!?]/g, '')  // 문장부호 제거
      .replace(/\s+/g, '')     // 공백 제거
      .toLowerCase();          // 소문자 변환
  }

  private createResponse(sentences: string[], entry: GrammarLearning) {
    const correctIndex = sentences.findIndex(s => 
      this.generateExactKey(s) === this.generateExactKey(entry.correctedText)
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

  public async findSimilarCorrection(sentences: string[]): Promise<{
    found: boolean;
    correctSentence?: string;
    correctIndex?: number;
    sentenceScores?: number[];
  }> {
    try {
      const originalText = sentences[0];
      console.time('cache-lookup');

      // 1. 정확한 매치 시도
      const exactKey = this.generateExactKey(originalText);
      const exactMatch = this.cache.get(exactKey);
      if (exactMatch) {
        console.timeEnd('cache-lookup');
        console.log('Exact cache hit');
        return this.createResponse(sentences, exactMatch);
      }

      // 2. 패턴 매치 시도
      const patternKey = this.generatePatternKey(originalText);
      const patternMatch = this.patternCache.get(patternKey);
      if (patternMatch) {
        console.timeEnd('cache-lookup');
        console.log('Pattern cache hit');
        return this.createResponse(sentences, patternMatch);
      }

      console.timeEnd('cache-lookup');
      return { found: false };

    } catch (error) {
      this.logger.error(`Error finding similar correction: ${error.message}`);
      return { found: false };
    }
  }

  public async learnCorrection(
    originalText: string,
    correctedText: string,
    alternativeSentences: string[] = []
  ): Promise<void> {
    try {
      const exactKey = this.generateExactKey(originalText);
      const patternKey = this.generatePatternKey(originalText);

      let entry = await this.learningRepository.findOne({
        where: { originalText }
      });

      if (entry) {
        entry.useCount += 1;
        entry.correctedText = correctedText;
        entry.alternativeSentences = alternativeSentences;
      } else {
        entry = this.learningRepository.create({
          originalText,
          correctedText,
          alternativeSentences,
          useCount: 1
        });
      }

      const savedEntry = await this.learningRepository.save(entry);
      
      // 캐시 업데이트
      this.cache.set(exactKey, savedEntry);
      this.patternCache.set(patternKey, savedEntry);

      this.logger.log(`Learned correction for: ${originalText}`);
    } catch (error) {
      this.logger.error(`Error learning correction: ${error.message}`);
    }
  }


  // 캐시 상태 확인을 위한 메서드
  public getCacheStats() {
    return {
      exactMatches: this.cache.size,
      patternMatches: this.patternCache.size,
      cacheEntries: Array.from(this.cache.entries()).map(([key, value]) => ({
        key,
        originalText: value.originalText,
        correctedText: value.correctedText,
        useCount: value.useCount
      }))
    };
  }
}