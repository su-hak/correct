import { ConfigService } from "@nestjs/config";
import { GrammarLearning } from "./entities/grammar-Learning.entity";
import { MoreThan, Repository } from "typeorm";
import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class GrammarLearningService {
  private readonly logger = new Logger(GrammarLearningService.name);
  private readonly cache = new Map<string, GrammarLearning>();
  private readonly patternCache = new Map<string, string>();
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

  public async findSimilarCorrection(sentences: string[]): Promise<{
    found: boolean;
    correctSentence?: string;
    correctIndex?: number;
    sentenceScores?: number[];
  }> {
    try {
      const originalText = sentences[0];
      const patterns = this.generatePattern(originalText);
      
      // 패턴 매칭으로 유사한 문장 찾기
      for (const pattern of patterns) {
        const match = this.frequentPatterns.get(pattern);
        if (match) {
          const correctIndex = sentences.findIndex(s => 
            this.generateExactKey(s) === this.generateExactKey(match.sentence)
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
}