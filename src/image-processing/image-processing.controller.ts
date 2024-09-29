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
      private results: Map<string, any> = new Map();
  
      constructor(
          private readonly visionService: VisionService,
          private readonly grammarService: GrammarService,
          @InjectQueue('image-processing') private readonly imageProcessingQueue: Queue
      ) {}
  
      @Post('analyze')
      @UseInterceptors(FileInterceptor('image'))
      async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        const jobId = uuidv4();
        await this.imageProcessingQueue.add('processImage', { jobId, imageBuffer: file.buffer });
        return { jobId, message: 'Image processing started' };
      }
  
      @Get('result/:jobId')
      async getAnalysisResult(@Param('jobId') jobId: string) {
          const result = await this.getStoredResult(jobId);
          if (!result) {
              throw new NotFoundException('Analysis result not found');
          }
          return result;
      }
  
      private async storeResult(jobId: string, result: any): Promise<void> {
        this.results.set(jobId, result);
    }

    private async getStoredResult(jobId: string): Promise<any> {
        return this.results.get(jobId);
    }
  }