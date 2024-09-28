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
          private visionService: VisionService,
          private grammarService: GrammarService,
          @InjectQueue('image-processing') private imageProcessingQueue: Queue
      ) {
          this.imageProcessingQueue.process(async (job) => {
              await this.processImageInBackground(job.data.jobId, job.data.buffer);
          });
  
          this.imageProcessingQueue.on('completed', (job) => {
              console.log(`Job ${job.id} completed`);
          });
  
          this.imageProcessingQueue.on('failed', (job, error) => {
              console.error(`Job ${job.id} failed:`, error);
          });
      }
  
      @Post('analyze')
      @UseInterceptors(FileInterceptor('image'))
      async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        const jobId = uuidv4();
        await this.imageProcessingQueue.add('processImage', { jobId, imageBuffer: file.buffer });
        return { jobId, message: 'Image processing started' };
      }
  
      private async processImageInBackground(jobId: string, imageBuffer: Buffer) {
          try {
              const sentences = await this.visionService.detectTextInImage(imageBuffer);
              const { correctSentence, correctIndex } = await this.grammarService.checkGrammar(sentences);
              await this.storeResult(jobId, { sentences, correctSentence, correctIndex });
          } catch (error) {
              this.logger.error(`Failed to process image: ${error.message}`, error.stack);
              await this.storeResult(jobId, { error: error.message });
          }
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