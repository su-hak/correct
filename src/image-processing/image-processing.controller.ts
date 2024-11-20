import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException, Res } from '@nestjs/common';
import { Response } from 'express';  // Express Response 타입 추가
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import * as sharp from 'sharp';
import { ENABLE_PERFORMANCE_LOGS } from 'src/constants/Logger.constants';

@Controller('image-processing')
export class ImageProcessingController {
  private readonly logger = new Logger(ImageProcessingController.name);

  constructor(
    private readonly visionService: VisionService,
    private readonly grammarService: GrammarService,
  ) { }

  // image-processing.controller.ts
  @Post('analyze')
  @UseInterceptors(FileInterceptor('image'))
  async analyzeImage(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const imageResult = await this.visionService.detectTextInImage(file.buffer);
      
      if (!imageResult.sentences.length) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'No text detected' })}\n\n`);
        return res.end();
      }
  
      res.write(`data: ${JSON.stringify({
        type: 'sentences',
        data: { sentences: imageResult.sentences }
      })}\n\n`);
  
      const grammarResult = await this.grammarService.findMostNaturalSentence(imageResult.sentences);
      
      res.write(`data: ${JSON.stringify({
        type: 'result',
        data: grammarResult
      })}\n\n`);
  
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Analysis failed' })}\n\n`);
      res.end();
    }
  }
}