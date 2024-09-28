import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import * as Queue from 'bull';

const imageProcessingQueue = new Queue('image-processing', process.env.REDIS_URL);

imageProcessingQueue.on('error', (error) => {
    console.error('Redis queue error:', error);
  });

@Controller('image-processing')
export class ImageProcessingController {
    private readonly logger = new Logger(ImageProcessingController.name);
    private results: Map<string, any> = new Map();

    constructor(
        private visionService: VisionService,
        private grammarService: GrammarService,
      ) {
        imageProcessingQueue.on('completed', (job) => {
          console.log(`Job ${job.id} completed`);
        });
    
        imageProcessingQueue.on('failed', (job, error) => {
          console.error(`Job ${job.id} failed:`, error);
        });
      }

    @Post('analyze')
    @UseInterceptors(FileInterceptor('image'))
    async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        try {
            const jobId = uuidv4();
            await imageProcessingQueue.add({ jobId, buffer: file.buffer });
            return { jobId, message: 'Image analysis started' };
        } catch (error) {
            this.logger.error(`Failed to queue image analysis: ${error.message}`, error.stack);
            console.error('Detailed error:', JSON.stringify(error, null, 2));
            // 클라이언트에 오류 응답
            throw new HttpException('Failed to start image analysis', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private async processImageInBackground(jobId: string, imageBuffer: Buffer) {
        try {
            const sentences = await this.visionService.detectTextInImage(imageBuffer);
            const { correctSentence, correctIndex } = await this.grammarService.checkGrammar(sentences);

            await this.storeResult(jobId, { sentences, correctSentence, correctIndex });
        } catch (error) {
            this.logger.error(`Failed to process image: ${error.message}`, error.stack);
            console.error('Detailed error:', JSON.stringify(error, null, 2));
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