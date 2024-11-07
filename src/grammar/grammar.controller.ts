import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
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
}