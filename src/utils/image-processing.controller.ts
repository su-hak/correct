import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';

@Controller('image-processing')
export class ImageProcessingController {
  private readonly logger = new Logger(ImageProcessingController.name);

  constructor(
    private visionService: VisionService,
    private grammarService: GrammarService,
  ) {}

  @Post('analyze')
  @UseInterceptors(FileInterceptor('image'))
  async analyzeImage(@UploadedFile() file: Express.Multer.File) {
    this.logger.log(`Received file: ${file.originalname}, size: ${file.size} bytes`);
    
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Empty file received');
    }

    const sentences = await this.visionService.detectTextInImage(file.buffer);
    const { correctSentence, correctIndex } = await this.grammarService.checkGrammar(sentences);

    return {
      sentences,
      correctSentence,
      correctIndex,
    };
  }
}