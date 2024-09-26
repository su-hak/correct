// grammar.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { OpenAiService } from './openai.service';

@Controller('grammar')
export class GrammarController {
  constructor(private openAiService: OpenAiService) {}

  @Post('check')
  async checkGrammar(@Body('text') text: string) {
    return this.openAiService.checkGrammar(text);
  }
}