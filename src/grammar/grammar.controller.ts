import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { GrammarService } from './grammar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('grammar')
export class GrammarController {
  constructor(private grammarService: GrammarService) {}

  @UseGuards(JwtAuthGuard)
  @Post('check')
  async checkGrammar(@Body('sentences') sentences: string[]): Promise<{ correctSentence: string }> {
    const correctSentence = await this.grammarService.checkGrammar(sentences);
    return { correctSentence };
  }
}