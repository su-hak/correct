import { GrammarService } from "src/grammar/grammar.service";
import { VisionService } from "./vision.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class ImageProcessingService {
  constructor(
    private readonly visionService: VisionService,
    private readonly grammarService: GrammarService
  ) {}

  async processImage(imageBuffer: Buffer): Promise<{
    sentences: string[],
    correctSentence: string,
    correctIndex: number
  }> {
    const { sentences } = await this.visionService.detectTextInImage(imageBuffer);

    // 최대 5개의 문장만 선택
    const limitedSentences = sentences.slice(0, 5);

    // 가장 자연스러운 문장 선택
    const { correctSentence, correctIndex } = await this.grammarService.findMostNaturalSentence(limitedSentences);

    return {
      sentences: limitedSentences,
      correctSentence,
      correctIndex
    };
  }
}