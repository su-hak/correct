import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { GrammarService } from './grammar.service';
import { AuthGuard } from '../auth/auth.guard';


@Controller('grammar')
export class GrammarController {
  constructor(private grammarService: GrammarService) {}

  @UseGuards(AuthGuard)
  @Post('check')
  async checkGrammar(@Body('sentences') sentences: string[]): Promise<{ correctSentence: string }> {
    const correctSentence = await this.grammarService.checkGrammar(sentences);
    return { correctSentence };
  }
}