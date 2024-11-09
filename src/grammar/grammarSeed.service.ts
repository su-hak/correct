import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GrammarLearningService } from "./grammar-Learning.service";
import axios from "axios";

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

  async generatePatternExamples() {
    const patterns = [
      {
        example: "여러 가지 다양한 꽃",
        prompt: "다음과 같은 패턴의 올바른 한국어 명사구 200개를 생성해주세요:\n" +
                "'여러 가지 다양한 꽃'과 같은 형태로, 수식어가 있는 명사구.\n" +
                "각 문장은 새로운 줄에 작성해주세요.\n" +
                "예시:\n" +
                "- 아름답고 화려한 정원\n" +
                "- 달콤하고 맛있는 과일\n" +
                "문장은 수식어 + 명사 구조여야 하며, 자연스러운 한국어여야 합니다."
      },
      {
        example: "마루가 쿵쿵하다",
        prompt: "다음과 같은 패턴의 올바른 한국어 문장 200개를 생성해주세요:\n" +
                "'마루가 쿵쿵하다'와 같은 형태로, 의성어/의태어를 포함한 문장.\n" +
                "각 문장은 새로운 줄에 작성해주세요.\n" +
                "예시:\n" +
                "- 비가 쏴쏴 내린다\n" +
                "- 종이가 바스락거린다"
      },
      {
        example: "원작이 개작되다",
        prompt: "다음과 같은 패턴의 올바른 한국어 문장 200개를 생성해주세요:\n" +
                "'원작이 개작되다'와 같은 형태로, 명사+조사+동사의 수동형 구조.\n" +
                "각 문장은 새로운 줄에 작성해주세요.\n" +
                "예시:\n" +
                "- 도서가 출판되다\n" +
                "- 영화가 상영되다"
      },
      {
        example: "같이 대화하기 싫을 정도야",
        prompt: "다음과 같은 패턴의 올바른 한국어 문장 200개를 생성해주세요:\n" +
                "'같이 대화하기 싫을 정도야'와 같은 형태로, 감정/평가를 나타내는 종결어미 구조.\n" +
                "각 문장은 새로운 줄에 작성해주세요.\n" +
                "예시:\n" +
                "- 함께 일하기 좋을 정도야\n" +
                "- 혼자 공부하기 편할 정도야"
      },
      {
        example: "한국에 언제 왔어요?",
        prompt: "다음과 같은 패턴의 올바른 한국어 의문문 200개를 생성해주세요:\n" +
                "'한국에 언제 왔어요?'와 같은 형태로, 장소/시간 관련 의문사를 포함한 질문.\n" +
                "각 문장은 새로운 줄에 작성해주세요.\n" +
                "예시:\n" +
                "- 학교에 어떻게 가요?\n" +
                "- 집에 몇 시에 도착해요?"
      }
    ];

    try {
      for (const pattern of patterns) {
        this.logger.log(`Generating examples for pattern: ${pattern.example}`);
        
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: "gpt-4",
            messages: [
              {
                role: "system",
                content: "당신은 한국어 문장 생성 전문가입니다. 주어진 패턴에 맞는 자연스러운 한국어 문장을 생성해주세요."
              },
              {
                role: "user",
                content: pattern.prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 2000
          },
          {
            headers: {
              'Authorization': `Bearer ${this.openaiApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const content = response.data.choices[0].message.content;
        const sentences = this.parseSentences(content);

        // 생성된 문장들을 학습 데이터로 저장
        for (const sentence of sentences) {
          await this.grammarLearningService.learnCorrection(sentence);
          await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
        }

        this.logger.log(`Completed pattern: ${pattern.example}, Generated: ${sentences.length} sentences`);
      }

      return { 
        success: true, 
        message: 'Pattern examples generated and saved successfully' 
      };
    } catch (error) {
      this.logger.error(`Error generating pattern examples: ${error.message}`);
      throw error;
    }
  }

  private parseSentences(content: string): string[] {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        // 빈 줄, 번호 매기기, 불릿 포인트 등 제거
        return line && 
               !line.match(/^\d+\./) && 
               !line.match(/^-/) &&
               !line.match(/^•/) &&
               line.length > 1;
      });
  }
}