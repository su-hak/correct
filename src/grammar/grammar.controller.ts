import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { GrammarService } from './grammar.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('grammar')
export class GrammarController {
  constructor(private grammarService: GrammarService) {}

  @UseGuards(AuthGuard)
  @Post('check')
  async checkGrammar(@Body('sentences') sentences: string[]): Promise<{ correctSentence: string }> {
    return this.grammarService.checkGrammar(sentences);
  }


  @UseGuards(AuthGuard)
  @Post('extract-and-check')
  async extractAndCheckGrammar(@Body('imageDescription') imageDescription: string): Promise<{ correctSentence: string, correctIndex: number }> {
    return this.grammarService.extractAndCheckGrammar(imageDescription);
  }
}