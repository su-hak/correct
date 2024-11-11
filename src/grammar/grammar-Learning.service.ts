import { ConfigService } from "@nestjs/config";
import { GrammarLearning } from "./entities/grammar-Learning.entity";
import { MoreThan, Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class GrammarLearningService {
  private readonly logger = new Logger(GrammarLearningService.name);
  private readonly cache = new Map<string, GrammarLearning>();
  private readonly frequentPatterns = new Map<string, {
    sentence: string,
    count: number,
    patterns: string[]
  }>();

  // DB 로드 상태 추적
  private cacheInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(
    @InjectRepository(GrammarLearning)
    private readonly learningRepository: Repository<GrammarLearning>
  ) {
    // 생성자에서는 초기화만 예약
    this.initializationPromise = this.initializeCache();
  }

  private async initializeCache() {
    if (this.cacheInitialized) return;
    
    try {
      const allEntries = await this.learningRepository.find({
        where: { useCount: MoreThan(0) },  // 사용된 적 있는 데이터만
        order: { useCount: 'DESC' },
        take: 1000,  // 상위 1000개만
      });

      // 캐시 초기화
      allEntries.forEach(entry => {
        this.cache.set(this.generateExactKey(entry.correctedText), entry);
        
        if (entry.patterns) {
          entry.patterns.forEach(pattern => {
            this.frequentPatterns.set(pattern, {
              sentence: entry.correctedText,
              count: entry.useCount,
              patterns: entry.patterns
            });
          });
        }
      });

      this.cacheInitialized = true;
    } catch (error) {
      this.logger.error('Cache initialization failed');
      throw error;
    }
  }

  public async findSimilarCorrection(sentences: string[]): Promise<{
    found: boolean;
    correctSentence?: string;
    correctIndex?: number;
    sentenceScores?: number[];
  }> {
    // 캐시 초기화 대기
    if (!this.cacheInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }

    try {
      const matchingScores = new Map<number, number>();
      
      // 정확한 매칭 먼저 시도
      for (let i = 0; i < sentences.length; i++) {
        const exactKey = this.generateExactKey(sentences[i]);
        if (this.cache.has(exactKey)) {
          return {
            found: true,
            correctSentence: sentences[i],
            correctIndex: i,
            sentenceScores: sentences.map((_, idx) => idx === i ? 100 : 0)
          };
        }
      }

      // 패턴 매칭
      const patternMatchPromises = sentences.map(async (sentence, index) => {
        const patterns = this.generatePattern(sentence);
        let maxScore = 0;

        for (const pattern of patterns) {
          const match = this.frequentPatterns.get(pattern);
          if (match?.count > 5) {
            const score = 60 + Math.min(match.count, 8) * 5;
            maxScore = Math.max(maxScore, score);
          }
        }

        if (maxScore > 0) {
          matchingScores.set(index, maxScore);
        }
      });

      // 병렬 처리
      await Promise.all(patternMatchPromises);

      if (matchingScores.size > 0) {
        const entries = Array.from(matchingScores.entries());
        const bestMatch = entries.reduce((a, b) => a[1] > b[1] ? a : b);

        if (bestMatch[1] >= 70) {
          return {
            found: true,
            correctSentence: sentences[bestMatch[0]],
            correctIndex: bestMatch[0],
            sentenceScores: sentences.map((_, i) => matchingScores.get(i) || 0)
          };
        }
      }

      return { found: false };
    } catch (error) {
      return { found: false };
    }
  }

  private generatePattern(text: string): string[] {
    const patterns = [];
    patterns.push(text.replace(/[은는이가을를에서도의로]\s*/g, '*'));
    
    const structurePattern = text
      .split(' ')
      .map(word => {
        if (word.match(/[다요]$/)) return 'V';
        if (word.match(/[은는이가을를에서도의로]$/)) return 'N';
        return '*';
      })
      .join(' ');
    patterns.push(structurePattern);

    return patterns;
  }

  private generateExactKey(text: string): string {
    return text.replace(/\s+/g, '').toLowerCase();
  }

  // learnCorrection은 비동기로 처리하되 응답을 기다리지 않음
  public learnCorrection(correctSentence: string, allSentences?: string[]): void {
    if (correctSentence.length < 4) return;

    const patterns = this.generatePattern(correctSentence);
    
    patterns.forEach(pattern => {
      const existing = this.frequentPatterns.get(pattern) || {
        sentence: correctSentence,
        count: 0,
        patterns: patterns
      };
      existing.count += 1;
      this.frequentPatterns.set(pattern, existing);
    });

    // DB 저장은 비동기로 처리
    this.saveToDB(correctSentence, patterns, allSentences).catch(err => 
      this.logger.error('Background learning failed:', err)
    );
  }

  private async saveToDB(
    correctSentence: string,
    patterns: string[],
    allSentences?: string[]
  ) {
    const entry = await this.learningRepository.findOne({
      where: { correctedText: correctSentence }
    }) || this.learningRepository.create({
      correctedText: correctSentence,
      originalText: correctSentence,
      patterns,
      alternativeSentences: allSentences?.filter(s => s !== correctSentence),
      useCount: 1
    });

    if (entry.id) {
      entry.useCount += 1;
      entry.patterns = patterns;
    }

    await this.learningRepository.save(entry);
    this.cache.set(this.generateExactKey(correctSentence), entry);
  }

  // 관리자용 메서드들 추가
  public async getCacheStats() {
    if (!this.cacheInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }

    return {
      exactMatches: this.cache.size,
      patternMatches: this.frequentPatterns.size,
      cacheEntries: Array.from(this.cache.entries())
        .map(([key, value]) => ({
          key,
          correctSentence: value.correctedText,
          patterns: value.patterns,
          useCount: value.useCount
        }))
        .sort((a, b) => b.useCount - a.useCount)
    };
  }

  public async inspectCache(sentence: string) {
    if (!this.cacheInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }

    const key = this.generateExactKey(sentence);
    const entry = this.cache.get(key);
    const patterns = entry?.patterns || [];
    
    return {
      exists: !!entry,
      entry,
      patterns,
      matchedPatterns: patterns.map(pattern => 
        this.frequentPatterns.get(pattern)
      ).filter(Boolean)
    };
  }

  public async removeCacheEntry(sentence: string) {
    if (!this.cacheInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }

    const key = this.generateExactKey(sentence);
    const entry = this.cache.get(key);

    if (entry) {
      // 캐시에서 제거
      this.cache.delete(key);

      // 패턴 캐시에서 제거
      if (entry.patterns) {
        entry.patterns.forEach(pattern => {
          this.frequentPatterns.delete(pattern);
        });
      }

      // DB에서 삭제
      await this.learningRepository.delete({ correctedText: sentence });
      return true;
    }
    return false;
  }

  public async addCacheEntry(
    sentence: string,
    options: { 
      useCount?: number;
      alternativeSentences?: string[];
    } = {}
  ) {
    if (!this.cacheInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }

    const key = this.generateExactKey(sentence);
    
    // 이미 존재하는 경우 먼저 제거
    if (this.cache.has(key)) {
      await this.removeCacheEntry(sentence);
    }

    // 새로운 패턴 생성
    const patterns = this.generatePattern(sentence);
    
    // DB에 저장
    const entry = this.learningRepository.create({
      correctedText: sentence,
      originalText: sentence,
      patterns,
      alternativeSentences: options.alternativeSentences || [],
      useCount: options.useCount || 1
    });

    const savedEntry = await this.learningRepository.save(entry);
    
    // 캐시에 추가
    this.cache.set(key, savedEntry);
    
    // 패턴 캐시에 추가
    patterns.forEach(pattern => {
      this.frequentPatterns.set(pattern, {
        sentence,
        count: options.useCount || 1,
        patterns
      });
    });

    return true;
  }
}