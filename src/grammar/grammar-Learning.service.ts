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
      this.logger.debug('Input sentences:', sentences);

      // 1단계: 기본적인 문법 검사 점수 계산
      const grammarScores = sentences.map(sentence => this.calculateGrammarScore(sentence));
      this.logger.debug('Grammar scores:', grammarScores);

      // 2단계: 학습 데이터 기반 매칭
      const matchingScores = new Map<number, number>();
      
      sentences.forEach((sentence, index) => {
        // 기본 문법 점수가 낮은 문장은 제외
        if (grammarScores[index] < 70) {
          this.logger.debug(`Sentence ${index} excluded due to low grammar score:`, sentence);
          return;
        }

        const sentencePatterns = this.generatePattern(sentence);
        let maxMatchScore = 0;

        sentencePatterns.forEach(pattern => {
          const match = this.frequentPatterns.get(pattern);
          if (match) {
            const matchScore = this.calculateMatchScore(match, sentence);
            maxMatchScore = Math.max(maxMatchScore, matchScore);
          }
        });

        matchingScores.set(index, maxMatchScore);
      });

      this.logger.debug('Matching scores:', Object.fromEntries(matchingScores));

      // 3단계: 최종 점수 계산 (문법 점수 70% + 매칭 점수 30%)
      const finalScores = sentences.map((_, index) => {
        const grammarScore = grammarScores[index];
        const matchScore = matchingScores.get(index) || 0;
        return (grammarScore * 0.7) + (matchScore * 0.3);
      });

      this.logger.debug('Final scores:', finalScores);

      // 최고 점수가 80점 이상인 경우만 선택
      const maxScore = Math.max(...finalScores);
      const bestIndex = finalScores.indexOf(maxScore);

      if (maxScore >= 80) {
        return {
          found: true,
          correctSentence: sentences[bestIndex],
          correctIndex: bestIndex,
          sentenceScores: finalScores
        };
      }

      return { found: false };

    } catch (error) {
      this.logger.error(`Error finding similar correction: ${error.message}`, error.stack);
      return { found: false };
    }
  }

  private calculateGrammarScore(sentence: string): number {
    let score = 100;
    
    // 1. 기본적인 문법 오류 체크
    if (sentence.includes('바게')) score -= 30;  // 맞춤법 오류
    if (sentence.includes('안되')) score -= 20;  // 띄어쓰기 오류
    if (sentence.includes('데서')) score -= 20;  // 맞춤법 오류
    if (sentence.includes('께서서')) score -= 30;  // 조사 중복

    // 2. 문장 구조 체크
    const words = sentence.split(' ');
    
    // 2.1 조사 사용 검사
    const hasInvalidParticle = words.some(word => 
      word.endsWith('은은') || 
      word.endsWith('는는') || 
      word.endsWith('이이') || 
      word.endsWith('가가')
    );
    if (hasInvalidParticle) score -= 25;

    // 2.2 문장 종결 검사
    const lastWord = words[words.length - 1];
    const hasValidEnding = /[다요죠네요까요]$/.test(lastWord);
    if (!hasValidEnding) score -= 15;

    // 2.3 문장 길이 검사
    if (words.length < 2) score -= 20;  // 너무 짧은 문장
    if (words.length > 15) score -= 15;  // 너무 긴 문장

    return Math.max(0, score);
  }

  private calculateMatchScore(match: { count: number, sentence: string }, currentSentence: string): number {
    let score = 0;
    
    // 1. 빈도수 기반 점수 (최대 40점)
    score += Math.min(match.count, 8) * 5;

    // 2. 문장 유사도 점수 (최대 60점)
    const similarity = this.calculateSentenceSimilarity(match.sentence, currentSentence);
    score += similarity * 60;

    return score;
  }

  private calculateSentenceSimilarity(s1: string, s2: string): number {
    // 단어 단위로 분리
    const words1 = new Set(s1.split(' '));
    const words2 = new Set(s2.split(' '));

    // 교집합 크기
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    // 합집합 크기
    const union = new Set([...words1, ...words2]);

    // 자카드 유사도 계산
    return intersection.size / union.size;
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