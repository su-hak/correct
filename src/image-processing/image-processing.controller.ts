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
        this.logger.log(`Received file: ${file ? 'yes' : 'no'}, size: ${file?.buffer.length || 0} bytes`);
        if (!file) {
          throw new BadRequestException('No file uploaded');
        }
        const jobId = uuidv4();
        await this.imageProcessingQueue.add('processImage', { jobId, imageBuffer: file.buffer });
        
        // 작업 시작 후 결과를 기다립니다
        let result;
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
          result = await this.getStoredResult(jobId);
          if (result) break;
        }
        
        if (!result) {
          throw new InternalServerErrorException('Failed to process image in time');
        }
        
        return result;
      }
  
      @Get('result/:jobId')
      async getAnalysisResult(@Param('jobId') jobId: string) {
          const result = await this.getStoredResult(jobId);
          if (!result) {
              throw new NotFoundException('Analysis result not found or not ready yet');
          }
          if (result.error) {
              throw new BadRequestException(result.error);
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