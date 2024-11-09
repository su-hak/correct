import { Controller, Post } from "@nestjs/common";
import { GrammarService } from "./grammar.service";
import { GrammarSeedService } from "./grammarSeed.service";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";

@Controller('admin/grammar')
export class GrammarAdminController {
  constructor(
    private grammarService: GrammarService,
    private grammarSeedService: GrammarSeedService
  ) {}

  @Post('seed-patterns')
  @ApiOperation({ summary: '패턴별 예문 생성 및 저장' })
  @ApiResponse({
    status: 200,
    description: '패턴별 예문 생성 결과',
    schema: {
      example: {
        success: true,
        message: 'Pattern examples generated and saved successfully'
      }
    }
  })
  async seedPatternExamples() {
    return this.grammarSeedService.generatePatternExamples();
  }
}