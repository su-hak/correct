import { Controller, Post } from "@nestjs/common";
import { GrammarService } from "./grammar.service";
import { GrammarSeedService } from "./grammarSeed.service";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

@Controller('admin/grammar')
@ApiTags('Grammar Admin')  // Swagger에서 그룹화
export class GrammarAdminController {
  constructor(
    private grammarService: GrammarService,
    private grammarSeedService: GrammarSeedService
  ) {}

  @Post('seed-patterns')
  @ApiOperation({ 
    summary: '패턴별 예문 자동 생성',
    description: `다음 5가지 패턴의 예문을 각각 200개씩 자동 생성하여 학습 데이터로 저장합니다:
    1. '여러 가지 다양한 꽃' 패턴 (수식어가 있는 명사구)
    2. '마루가 쿵쿵하다' 패턴 (의성어/의태어)
    3. '원작이 개작되다' 패턴 (수동형)
    4. '같이 대화하기 싫을 정도야' 패턴 (감정/평가)
    5. '한국에 언제 왔어요?' 패턴 (의문문)`
  })
  @ApiResponse({
    status: 200,
    description: '예문 생성 성공',
    schema: {
      example: {
        success: true,
        message: 'Pattern examples generated and saved successfully',
        details: {
          totalGenerated: 1000,
          patternCounts: {
            '수식어_명사구': 200,
            '의성어_의태어': 200,
            '수동형': 200,
            '감정_평가': 200,
            '의문문': 200
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'OpenAI API 호출 실패 또는 생성 오류',
    schema: {
      example: {
        success: false,
        message: 'Failed to generate pattern examples',
        error: 'OpenAI API error or generation failure'
      }
    }
  })
  async seedPatternExamples() {
    return this.grammarSeedService.generatePatternExamples();
  }
}