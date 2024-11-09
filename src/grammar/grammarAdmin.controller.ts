import { Controller, Param, Post } from "@nestjs/common";
import { GrammarService } from "./grammar.service";
import { GrammarSeedService } from "./grammarSeed.service";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

@Controller('admin/grammar')
@ApiTags('Grammar Admin')
export class GrammarAdminController {
  constructor(
    private grammarSeedService: GrammarSeedService
  ) {}

  @Post('seed-patterns/:patternIndex')
  @ApiOperation({ 
    summary: '패턴별 예문 생성 (40개씩 배치 처리)',
    description: '선택한 패턴의 예문을 40개씩 생성합니다. 전체 200개를 위해 5번 실행이 필요합니다.'
  })
  @ApiParam({
    name: 'patternIndex',
    required: true,
    description: '생성할 패턴 번호 (1-5)',
    example: 1
  })
  @ApiResponse({
    status: 200,
    description: '예문 생성 성공',
    schema: {
      example: {
        success: true,
        patternExample: "여러 가지 다양한 꽃",
        generatedCount: 40,
        sentences: [
          "크고 화려한 정원",
          "작고 귀여운 강아지",
          // ... 더 많은 문장들
        ]
      }
    }
  })
  async seedPatternBatch(@Param('patternIndex') patternIndex: number) {
    return this.grammarSeedService.generateBatchExamples(Number(patternIndex));
  }
}