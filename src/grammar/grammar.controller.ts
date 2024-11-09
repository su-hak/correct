import { Controller, Post, Body, UseGuards, Get, Param, Delete } from '@nestjs/common';
import { GrammarService } from './grammar.service';
import { AuthGuard } from '../auth/auth.guard';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GrammarLearningService } from './grammar-Learning.service';

@Controller('grammar')
export class GrammarController {
  constructor(
    private grammarService: GrammarService,
    private readonly grammarLearningService: GrammarLearningService
  ) {}

  @Post('check')
  async checkGrammar(@Body('sentences') sentences: string[]): Promise<{ 
    correctSentence: string;
    correctIndex: number;
    sentenceScores: number[];
  }> {
    return this.grammarService.findMostNaturalSentence(sentences);
  }

  @Get('cache-stats')
  @ApiOperation({ summary: '학습된 맞춤법 패턴 통계 조회' })
  @ApiResponse({
    status: 200,
    description: '캐시된 맞춤법 패턴 통계',
    schema: {
      example: {
        exactMatches: 50,
        patternMatches: 50,
        cacheEntries: [
          {
            key: "안녕하세요",
            originalText: "안녕 하세요",
            correctedText: "안녕하세요",
            useCount: 5
          }
        ]
      }
    }
  })
  getCacheStats() {
    return this.grammarLearningService.getCacheStats();
  }

  @Get('cache/inspect/:sentence')
  @ApiOperation({ summary: '특정 문장의 캐시 상태 상세 확인' })
  @ApiResponse({
    status: 200,
    description: '문장의 캐시 상태 정보',
    schema: {
      example: {
        exists: true,
        entry: {
          correctedText: "안녕하세요",
          patterns: ["* 하세요", "V"],
          useCount: 5
        },
        patterns: ["* 하세요", "V"],
        matchedSentences: ["안녕하세요", "잘 가세요"]
      }
    }
  })
  async inspectCache(@Param('sentence') sentence: string) {
    return this.grammarLearningService.inspectCache(sentence);
  }

  @Delete('cache/:sentence')
  @ApiOperation({ summary: '캐시에서 특정 문장 수동 제거' })
  @ApiResponse({
    status: 200,
    description: '캐시 제거 결과',
    schema: {
      example: {
        success: true
      }
    }
  })
  async removeCache(@Param('sentence') sentence: string) {
    return this.grammarLearningService.removeCacheEntry(sentence);
  }

  @Post('cache')
  async addCache(
    @Body() data: { 
      sentence: string; 
      useCount?: number;
      alternativeSentences?: string[];
    }
  ) {
    return this.grammarLearningService.addCacheEntry(
      data.sentence, 
      {
        useCount: data.useCount,
        alternativeSentences: data.alternativeSentences
      }
    );
  }
}