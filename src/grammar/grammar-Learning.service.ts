import { ConfigService } from "@nestjs/config";
import { GrammarLearning } from "./entities/grammar-Learning.entity";
import { MoreThan, Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class GrammarLearningService {
  private readonly logger = new Logger(GrammarLearningService.name);
  private readonly cache = new Map<string, GrammarLearning>();
  private readonly patternCache = new Map<string, Set<string>>();
  private readonly frequentPatterns = new Map<string, {
    sentence: string,
    count: number,
    patterns: string[]
  }>();

  constructor(
    @InjectRepository(GrammarLearning)
    private readonly learningRepository: Repository<GrammarLearning>
  ) {
    this.initializeCache();  // 생성자에서 캐시 초기화 호출
  }
  
  // 캐시 초기화 메서드 추가
  private async initializeCache() {
    try {
      // DB에서 모든 학습 데이터 로드
      const allEntries = await this.learningRepository.find({
        order: {
          useCount: 'DESC',  // 사용 빈도순으로 정렬
        }
      });

      this.logger.log(`Loading ${allEntries.length} entries from database`);

      // 캐시 초기화
      allEntries.forEach(entry => {
        // 기본 캐시에 저장
        this.cache.set(this.generateExactKey(entry.correctedText), entry);

        // 패턴 캐시 및 빈도수 저장
        if (entry.patterns) {
          entry.patterns.forEach(pattern => {
            const existing = this.frequentPatterns.get(pattern) || {
              sentence: entry.correctedText,
              count: 0,
              patterns: entry.patterns
            };
            existing.count = entry.useCount;
            this.frequentPatterns.set(pattern, existing);
          });
        }
      });

      this.logger.log(`Cache initialized with ${this.cache.size} entries`);
      this.logger.log(`Pattern cache initialized with ${this.frequentPatterns.size} patterns`);

    } catch (error) {
      this.logger.error('Failed to initialize cache:', error);
    }
  }

  private generateExactKey(text: string): string {
    const key = text.replace(/\s+/g, '').toLowerCase();
    this.logger.debug(`Generated key for text "${text}": ${key}`);
    return key;
  }

  private generatePattern(text: string): string[] {
    const patterns = [];
    
    // 1. 기본 패턴 (조사 제거)
    patterns.push(
      text.replace(/[은는이가을를에서도의로]\s*/g, '*')
    );

    // 2. 문장 구조 패턴
    const structurePattern = text
      .split(' ')
      .map(word => {
        if (word.match(/[다요]$/)) return 'V';
        if (word.match(/[은는이가을를에서도의로]$/)) return 'N';
        return '*';
      })
      .join(' ');
    patterns.push(structurePattern);

    // 3. 어미 패턴
    const endingPattern = text.match(/[다요습니까]$/)?.[0] || '';
    if (endingPattern) patterns.push(`*${endingPattern}`);

    return patterns;
  }

  public async findSimilarCorrection(sentences: string[]): Promise<{
    found: boolean;
    correctSentence?: string;
    correctIndex?: number;
    sentenceScores?: number[];
  }> {
    try {
      const originalText = sentences[0];
      this.logger.debug(`Finding similar correction for original text: ${originalText}`);
      this.logger.debug(`Cache size: ${this.cache.size}, Pattern cache size: ${this.patternCache.size}`);

      const patterns = this.generatePattern(originalText);
      this.logger.debug('Generated patterns:', patterns);
      
      // 1단계: 정확한 매칭 확인
      for (let i = 0; i < sentences.length; i++) {
        const exactKey = this.generateExactKey(sentences[i]);
        if (this.cache.has(exactKey)) {
          this.logger.debug(`Found exact match for sentence: ${sentences[i]}`);
          return {
            found: true,
            correctSentence: sentences[i],
            correctIndex: i,
            sentenceScores: sentences.map((_, idx) => idx === i ? 100 : 0)
          };
        }
      }

      // 2단계: 패턴 매칭
      const matchingScores = new Map<number, number>();
      
      sentences.forEach((sentence, index) => {
        const sentencePatterns = this.generatePattern(sentence);
        this.logger.debug(`Patterns for sentence ${index}:`, sentencePatterns);

        let maxScore = 0;
        sentencePatterns.forEach(pattern => {
          const match = this.frequentPatterns.get(pattern);
          if (match) {
            this.logger.debug(`Found pattern match for sentence ${index}:`, {
              pattern,
              matchedSentence: match.sentence,
              frequency: match.count
            });
            
            // 기본 점수 (패턴 매칭)
            const baseScore = 60;
            // 빈도수 보너스 (최대 40점)
            const frequencyBonus = Math.min(match.count, 10) * 4;
            const score = baseScore + frequencyBonus;
            
            maxScore = Math.max(maxScore, score);
          }
        });

        if (maxScore > 0) {
          matchingScores.set(index, maxScore);
        }
      });

      if (matchingScores.size > 0) {
        this.logger.debug('Final matching scores:', Object.fromEntries(matchingScores));
        const entries = Array.from(matchingScores.entries());
        const bestMatch = entries.reduce((a, b) => a[1] > b[1] ? a : b);

        // 최소 점수 기준을 60점으로 낮춤
        if (bestMatch[1] >= 60) {
          return {
            found: true,
            correctSentence: sentences[bestMatch[0]],
            correctIndex: bestMatch[0],
            sentenceScores: sentences.map((_, i) => matchingScores.get(i) || 0)
          };
        }
      }

      this.logger.debug('No matching pattern found with sufficient score');
      return { found: false };

    } catch (error) {
      this.logger.error(`Error finding similar correction: ${error.message}`, error.stack);
      return { found: false };
    }
  }

  public async learnCorrection(correctSentence: string, allSentences?: string[]): Promise<void> {
    try {
      if (
        correctSentence.includes('선택') || 
        correctSentence.includes('올바른') ||
        correctSentence.length < 4
      ) {
        return;
      }

      const patterns = this.generatePattern(correctSentence);
      
      // 패턴 빈도 수 증가
      patterns.forEach(pattern => {
        const existing = this.frequentPatterns.get(pattern) || {
          sentence: correctSentence,
          count: 0,
          patterns: patterns
        };
        
        existing.count += 1;
        this.frequentPatterns.set(pattern, existing);
      });

      // DB에 저장
      let entry = await this.learningRepository.findOne({
        where: { correctedText: correctSentence }
      });

      if (entry) {
        entry.useCount += 1;
        entry.patterns = patterns;
      } else {
        entry = this.learningRepository.create({
          correctedText: correctSentence,
          originalText: correctSentence,
          patterns: patterns,
          alternativeSentences: allSentences?.filter(s => s !== correctSentence) || [],
          useCount: 1
        });
      }

      const savedEntry = await this.learningRepository.save(entry);
      this.cache.set(this.generateExactKey(correctSentence), savedEntry);

      this.logger.log(`Learned patterns for: ${correctSentence}`);
    } catch (error) {
      this.logger.error(`Error learning correction: ${error.message}`);
    }
  }

  // getCacheStats 메서드 수정
  public async getCacheStats() {
    // DB에서 최신 데이터 다시 로드
    await this.initializeCache();

    return {
      exactMatches: this.cache.size,
      patternMatches: this.frequentPatterns.size,
      cacheEntries: Array.from(this.cache.entries())
        .filter(([_, value]) => 
          !value.correctedText.includes('선택') &&
          !value.correctedText.includes('올바른') &&
          value.correctedText.length >= 4
        )
        .map(([key, value]) => ({
          key,
          correctSentence: value.correctedText,
          patterns: value.patterns,
          useCount: value.useCount
        }))
        .sort((a, b) => b.useCount - a.useCount)  // 사용 빈도순 정렬
    };
  }
  
  public async inspectCache(sentence: string) {
    const key = this.generateExactKey(sentence);
    const entry = this.cache.get(key);
    const patterns = entry?.patterns || [];
    
    return {
      exists: !!entry,
      entry,
      patterns,
      matchedSentences: patterns.map(pattern => 
        Array.from(this.patternCache.get(pattern) || [])
      ).flat()
    };
  }

  // 캐시에서 특정 문장 수동 제거
  public async removeCacheEntry(sentence: string) {
    try {
      const key = this.generateExactKey(sentence);
      const entry = this.cache.get(key);

      if (entry) {
        // 캐시에서 제거
        this.cache.delete(key);

        // 패턴 캐시에서 제거
        if (entry.patterns) {
          entry.patterns.forEach(pattern => {
            const sentences = this.patternCache.get(pattern);
            if (sentences) {
              sentences.delete(sentence); // Set의 delete 메서드 사용
              if (sentences.size === 0) { // Set의 size 속성 사용
                this.patternCache.delete(pattern);
                this.frequentPatterns.delete(pattern);
              }
            }
          });
        }

        // DB에서 삭제
        await this.learningRepository.delete({ correctedText: sentence });
        
        this.logger.log(`Admin removed cache entry: ${sentence}`);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Error removing cache entry: ${error.message}`);
      throw error;
    }
  }

  public async addCacheEntry(
    sentence: string,
    options: { 
      useCount?: number;
      alternativeSentences?: string[];
    } = {}
  ) {
    try {
      const key = this.generateExactKey(sentence);
      
      // 이미 존재하는 경우 업데이트
      if (this.cache.has(key)) {
        await this.removeCacheEntry(sentence);
      }

      // 새로운 패턴 생성
      const patterns = this.generatePattern(sentence);
      
      // DB에 저장
      const entry = this.learningRepository.create({
        correctedText: sentence,
        originalText: sentence,
        patterns: patterns,
        alternativeSentences: options.alternativeSentences || [],
        useCount: options.useCount || 1
      });

      const savedEntry = await this.learningRepository.save(entry);
      
      // 캐시에 추가
      this.cache.set(key, savedEntry);
      
      // 패턴 캐시에 추가
      patterns.forEach(pattern => {
        const sentences = this.patternCache.get(pattern) || new Set();
        sentences.add(sentence);
        this.patternCache.set(pattern, sentences);
      });

      this.logger.log(`Admin added new cache entry: ${sentence}`);
      return true;
    } catch (error) {
      this.logger.error(`Error adding cache entry: ${error.message}`);
      throw error;
    }
  }
}