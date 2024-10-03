import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull'

@Controller('image-processing')
export class ImageProcessingController {
    private readonly logger = new Logger(ImageProcessingController.name);

    constructor(
        private readonly visionService: VisionService,
        private readonly grammarService: GrammarService,
    ) { }

    @Post('analyze')
    @UseInterceptors(FileInterceptor('image'))
    async analyzeImage(@UploadedFile() file: Express.Multer.File) {
      this.logger.log(`Received file: ${file ? 'yes' : 'no'}, size: ${file?.buffer?.length || 0} bytes`);
      if (!file || !file.buffer || file.buffer.length === 0) {
        throw new BadRequestException('Invalid file uploaded');
      }
    
      try {
        const { sentences } = await this.visionService.detectTextInImage(file.buffer);
        const firstSentence = sentences[0] || '';
        const result = await this.grammarService.evaluateSentence(firstSentence);
  
        return {
          sentence: firstSentence,
          score: result.score,
          feedback: result.feedback
        };
      } catch (error) {
        this.logger.error(`Failed to analyze image: ${error.message}`, error.stack);
        throw new InternalServerErrorException(`Image analysis failed: ${error.message}`);
      }
    }

}