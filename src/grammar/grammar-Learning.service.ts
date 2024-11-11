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
    return text.replace(/\s+/g, '').toLowerCase();
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

  private calculatePatternMatchScore(pattern1: string, pattern2: string): number {
    if (pattern1 === pattern2) return 100;
    
    // 레벤슈타인 거리 기반 유사도 계산
    const distance = this.levenshteinDistance(pattern1, pattern2);
    const maxLength = Math.max(pattern1.length, pattern2.length);
    const similarity = 1 - (distance / maxLength);
    
    return Math.floor(similarity * 100);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        if (str1[i-1] === str2[j-1]) {
          matrix[i][j] = matrix[i-1][j-1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i-1][j-1] + 1,
            matrix[i][j-1] + 1,
            matrix[i-1][j] + 1
          );
        }
      }
    }
    
    return matrix[str1.length][str2.length];
  }

  public async findSimilarCorrection(sentences: string[]): Promise<{
    found: boolean;
    correctSentence?: string;
    correctIndex?: number;
    sentenceScores?: number[];
  }> {
    try {
      const originalText = sentences[0];
      const patterns = this.generatePattern(originalText);
      
      // 전체 문장에 대한 스코어 맵 초기화
      const matchingScores = new Map<number, {
        score: number,
        frequency: number
      }>();
      
      // 각 문장별로 패턴 매칭 수행
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i];
        const sentencePatterns = this.generatePattern(sentence);
        
        for (const pattern of sentencePatterns) {
          const match = this.frequentPatterns.get(pattern);
          if (match) {
            const currentScore = matchingScores.get(i) || { score: 0, frequency: 0 };
            
            // match.patterns 배열의 각 패턴과 비교하여 최고 점수 사용
            const patternScores = match.patterns.map(matchPattern => 
              this.calculatePatternMatchScore(pattern, matchPattern)
            );
            const bestPatternScore = Math.max(...patternScores, 0);
            
            // 빈도수 가중치 (0-50)
            const frequencyWeight = Math.min(match.count / 10, 5) * 10;
            
            currentScore.score += bestPatternScore;
            currentScore.frequency += frequencyWeight;
            matchingScores.set(i, currentScore);
          }
        }
      }

      // 최종 스코어 계산 (패턴 매칭 70% + 빈도수 30%)
      const finalScores = new Map<number, number>();
      matchingScores.forEach((value, key) => {
        const finalScore = (value.score * 0.7) + (value.frequency * 0.3);
        finalScores.set(key, finalScore);
      });

      if (finalScores.size > 0) {
        const entries = Array.from(finalScores.entries());
        // 스코어가 가장 높은 상위 3개 중에서 선택
        const topScores = entries
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        // 가장 높은 스코어가 특정 임계값을 넘는 경우에만 반환
        if (topScores[0][1] >= 70) {
          return {
            found: true,
            correctSentence: sentences[topScores[0][0]],
            correctIndex: topScores[0][0],
            sentenceScores: sentences.map((_, i) => finalScores.get(i) || 0)
          };
        }
      }

      return { found: false };
    } catch (error) {
      this.logger.error(`Error finding similar correction: ${error.message}`);
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