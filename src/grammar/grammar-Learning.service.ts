import { ConfigService } from "@nestjs/config";
import { GrammarLearning } from "./entities/grammar-Learning.entity";
import { MoreThan, Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { PerformanceLogger } from "src/performance_Logger";

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


  // grammar-learning.service.ts에 추가
public async getBestGuess(sentences: string[]): Promise<{
  sentence: string;
  index: number;
}> {
  try {
    // 문법 점수 계산
    const grammarScores = sentences.map(sentence => this.calculateGrammarScore(sentence));
    
    // 가장 높은 문법 점수를 가진 문장 선택
    let bestIndex = 0;
    let bestScore = grammarScores[0];

    for (let i = 1; i < grammarScores.length; i++) {
      if (grammarScores[i] > bestScore) {
        bestScore = grammarScores[i];
        bestIndex = i;
      }
    }

    return {
      sentence: sentences[bestIndex],
      index: bestIndex
    };
  } catch (error) {
    // 에러 발생 시 첫 번째 문장 반환
    return {
      sentence: sentences[0],
      index: 0
    };
  }
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

  private calculateGrammarScore(sentence: string): number {
    let score = 100;
    
    // 1. 치명적인 오류 체크 (-50점)
    const criticalErrors = [
      '바게', '안되', '데서', '께서서',  // 맞춤법 오류
      '은은', '는는', '이이', '가가',    // 조사 중복
    ];
  
    const hasCriticalError = criticalErrors.some(error => sentence.includes(error));
    if (hasCriticalError) {
      score -= 50;
    }
  
    // 2. 기본 문장 구조 체크 (-30점)
    const words = sentence.split(' ');
    
    // 2.1 문장 종결 검사
    const lastWord = words[words.length - 1];
    const validEndings = ['다', '요', '죠', '네요', '까요'];
    const hasValidEnding = validEndings.some(ending => lastWord.endsWith(ending));
    if (!hasValidEnding) {
      score -= 30;
    }
  
    // 2.2 문장 구성 요소 검사
    const hasSubject = words.some(word => word.endsWith('은') || word.endsWith('는') || 
                                        word.endsWith('이') || word.endsWith('가'));
    if (!hasSubject) {
      score -= 20;
    }
  
    // 3. 올바른 한글 사용 체크
    const koreanCharCount = (sentence.match(/[가-힣]/g) || []).length;
    const totalCharCount = sentence.replace(/\s/g, '').length;
    const koreanRatio = koreanCharCount / totalCharCount;
  
    if (koreanRatio < 0.7) {  // 한글 비율이 70% 미만이면 감점
      score -= 20;
    }
  
    // 4. 조사 사용 검사
    const hasValidParticles = /[은는이가을를에서도의로]/.test(sentence);
    if (!hasValidParticles) {
      score -= 20;
    }
  
    // 5. 의심스러운 패턴 체크
    const suspiciousPatterns = [
      /[ㄱ-ㅎㅏ-ㅣ]/,  // 한글 자음/모음만 있는 경우
      /\d{2,}/,       // 긴 숫자
      /[a-zA-Z]{3,}/, // 긴 영문
    ];
  
    if (suspiciousPatterns.some(pattern => pattern.test(sentence))) {
      score -= 30;
    }
  
    // 최종 점수 반환 (0-100 사이로 제한)
    return Math.max(0, Math.min(100, score));
  }
  
  public async findSimilarCorrection(sentences: string[]): Promise<{
    found: boolean;
    correctSentence?: string;
    correctIndex?: number;
    sentenceScores?: number[];
  }> {
    PerformanceLogger.start('findSimilarCorrection');
    try {
      if (!this.cacheInitialized && this.initializationPromise) {
        PerformanceLogger.start('cacheInitialization');
        await this.initializationPromise;
        PerformanceLogger.end('cacheInitialization', this.logger);
      }
  
      // 문법 점수 계산
      PerformanceLogger.start('grammarScoring');
      const grammarScores = sentences.map(sentence => this.calculateGrammarScore(sentence));
      PerformanceLogger.end('grammarScoring', this.logger);

      // 패턴 매칭
      PerformanceLogger.start('patternMatching');
      const matchingScores = new Map<number, number>();
  
      // 모든 문장에 대해 패턴 매칭 수행
      await Promise.all(sentences.map(async (sentence, index) => {
        // 문법 점수가 50점 미만인 문장은 제외
        if (grammarScores[index] < 50) return;
  
        const patterns = this.generatePattern(sentence);
        let maxPatternScore = 0;
  
        for (const pattern of patterns) {
          const match = this.frequentPatterns.get(pattern);
          if (match?.count > 0) {
            const patternScore = Math.min(match.count * 5, 40);  // 최대 40점
            maxPatternScore = Math.max(maxPatternScore, patternScore);
          }
        }
  
        // 최종 점수 = 문법 점수(70%) + 패턴 점수(30%)
        const finalScore = (grammarScores[index] * 0.7) + (maxPatternScore * 0.3);
        matchingScores.set(index, finalScore);
      }));
      PerformanceLogger.end('patternMatching', this.logger);

  
      // 결과 선택
      PerformanceLogger.start('resultSelection');
      const entries = Array.from(matchingScores.entries());
      const validEntries = entries.filter(([_, score]) => score >= 70);

  
      const result = validEntries.length > 0 
        ? {
            found: true,
            correctSentence: sentences[validEntries[0][0]],
            correctIndex: validEntries[0][0],
            sentenceScores: sentences.map((_, i) => matchingScores.get(i) || 0)
          }
        : { found: false };

      PerformanceLogger.end('resultSelection', this.logger);
      PerformanceLogger.end('findSimilarCorrection', this.logger);

      return result;
    } catch (error) {
      PerformanceLogger.end('findSimilarCorrection', this.logger);
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