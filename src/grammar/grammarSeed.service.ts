import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GrammarLearningService } from "./grammar-Learning.service";
import axios from "axios";
import { ApiOperation, ApiParam } from "@nestjs/swagger";

@Injectable()
export class GrammarSeedService {
  private readonly logger = new Logger(GrammarSeedService.name);
  private readonly openaiApiKey: string;

  constructor(
    private configService: ConfigService,
    private grammarLearningService: GrammarLearningService
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  @ApiOperation({ 
    summary: '패턴별 예문 자동 생성 (배치 처리)',
    description: `선택한 패턴의 예문을 40개씩 생성합니다. 총 5번 실행하여 200개를 생성하세요.`
  })
  @ApiParam({
    name: 'patternIndex',
    required: true,
    description: `생성할 패턴 선택:
    1: '여러 가지 다양한 꽃' (수식어가 있는 명사구)
    2: '마루가 쿵쿵하다' (의성어/의태어)
    3: '원작이 개작되다' (수동형)
    4: '같이 대화하기 싫을 정도야' (감정/평가)
    5: '한국에 언제 왔어요?' (의문문)`,
    example: 1
  })
  async generateBatchExamples(patternIndex: number) {
    const patterns = [
      {
        example: "여러 가지 다양한 꽃",
        prompt: "다음과 같은 패턴의 올바른 한국어 명사구 40개를 생성해주세요:\n" +
                "'여러 가지 다양한 꽃'과 같은 형태로, 수식어가 있는 명사구.\n" +
                "각 문장은 새로운 줄에 작성해주세요."
      },
      {
        example: "마루가 쿵쿵하다",
        prompt: "다음과 같은 패턴의 올바른 한국어 문장 40개를 생성해주세요:\n" +
                "'마루가 쿵쿵하다'와 같은 형태로, 의성어/의태어를 포함한 문장.\n" +
                "각 문장은 새로운 줄에 작성해주세요."
      },
      {
        example: "원작이 개작되다",
        prompt: "다음과 같은 패턴의 올바른 한국어 문장 40개를 생성해주세요:\n" +
                "'원작이 개작되다'와 같은 형태로, 명사+조사+동사의 수동형 구조.\n" +
                "각 문장은 새로운 줄에 작성해주세요."
      },
      {
        example: "같이 대화하기 싫을 정도야",
        prompt: "다음과 같은 패턴의 올바른 한국어 문장 40개를 생성해주세요:\n" +
                "'같이 대화하기 싫을 정도야'와 같은 형태로, 감정/평가를 나타내는 종결어미 구조.\n" +
                "각 문장은 새로운 줄에 작성해주세요."
      },
      {
        example: "한국에 언제 왔어요?",
        prompt: "다음과 같은 패턴의 올바른 한국어 의문문 40개를 생성해주세요:\n" +
                "'한국에 언제 왔어요?'와 같은 형태로, 장소/시간 관련 의문사를 포함한 질문.\n" +
                "각 문장은 새로운 줄에 작성해주세요."
      }
    ];

    try {
      if (patternIndex < 1 || patternIndex > patterns.length) {
        throw new BadRequestException('Invalid pattern index');
      }

      const pattern = patterns[patternIndex - 1];
      this.logger.log(`Generating batch examples for pattern: ${pattern.example}`);
      
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "당신은 한국어 문장 생성 전문가입니다. 주어진 패턴에 맞는 자연스럽고 짧은 한국어 문장을 생성해주세요."
            },
            {
              role: "user",
              content: pattern.prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      this.logger.log('Raw OpenAI response:', content); // 원본 응답 로깅

      const sentences = this.parseSentences(content);
      this.logger.log(`Parsed ${sentences.length} sentences`); // 파싱된 문장 수 로깅

      if (sentences.length === 0) {
        this.logger.warn('No sentences were parsed from the response');
        throw new Error('No sentences generated');
      }

      // 생성된 문장들을 학습 데이터로 저장
      const savedSentences = [];
      for (const sentence of sentences) {
        await this.grammarLearningService.learnCorrection(sentence);
        savedSentences.push(sentence);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const result = { 
        success: true, 
        patternExample: pattern.example,
        generatedCount: savedSentences.length,
        sentences: savedSentences,
        rawResponse: content // 디버깅을 위해 원본 응답도 포함
      };

      this.logger.log(`Successfully generated and saved ${savedSentences.length} sentences`);
      return result;

    } catch (error) {
      this.logger.error(`Error generating batch examples: ${error.message}`);
      if (error.response?.data) {
        this.logger.error('OpenAI API Error:', error.response.data);
      }
      throw error;
    }
  }

  private parseSentences(content: string): string[] {
    if (!content) {
      this.logger.warn('Empty content received');
      return [];
    }

    // 줄바꿈 처리 개선
    const lines = content.split(/[\n\r]+/);
    this.logger.log(`Split into ${lines.length} lines`);

    const sentences = lines
      .map(line => {
        // 번호, 불릿, 특수문자 등 제거
        return line
          .replace(/^\d+\.\s*/, '')  // 숫자와 점으로 시작하는 경우
          .replace(/^[-•※]\s*/, '')  // 불릿으로 시작하는 경우
          .trim();
      })
      .filter(line => {
        const isValid = line && line.length > 1;
        if (!isValid && line) {
          this.logger.warn(`Filtered out line: "${line}"`);
        }
        return isValid;
      });

    this.logger.log(`Parsed ${sentences.length} valid sentences`);
    sentences.forEach((s, i) => this.logger.debug(`Sentence ${i + 1}: ${s}`));

    return sentences;
  }
}