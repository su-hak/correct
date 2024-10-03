import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Job, Queue } from 'bull';
import { InjectQueue, Process } from '@nestjs/bull'

@Controller('image-processing')
export class ImageProcessingController {
    private readonly logger = new Logger(ImageProcessingController.name);
    private results: Map<string, any> = new Map();

    constructor(
        private readonly visionService: VisionService,
        private readonly grammarService: GrammarService,
        @InjectQueue('image-processing') private readonly imageProcessingQueue: Queue
    ) { }

    @Post('analyze')
    @UseInterceptors(FileInterceptor('image'))
    async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        this.logger.log(`Received file: ${file ? 'yes' : 'no'}, size: ${file?.buffer?.length || 0} bytes`);
        if (!file || !file.buffer || file.buffer.length === 0) {
            throw new BadRequestException('Invalid file uploaded');
        }

        try {

            const jobId = uuidv4();
            await this.imageProcessingQueue.add('processImage', {
                jobId,
                fileBuffer: file.buffer
            });

            return { jobId };
        } catch (error) {
            this.logger.error(`Failed to analyze image: ${error.message}`, error.stack);
            throw new InternalServerErrorException(`Image analysis failed: ${error.message}`);
        }
    }

    @Process('processImage')
    async handleImageProcessing(job: Job) {
        const { jobId, fileBuffer } = job.data;
        try {
            const { sentences, boundingBoxes } = await this.visionService.detectTextInImage(fileBuffer);
            const { correctSentence, correctIndex, sentenceScores } = await this.grammarService.findMostNaturalSentence(sentences);

            const result = {
                sentences,
                boundingBoxes,
                correctSentence,
                correctIndex: parseInt(correctIndex.toString()),
                sentenceScores: sentenceScores.map(score => parseFloat(score.toFixed(2)))
            };

            await this.storeResult(jobId, result);
        } catch (error) {
            this.logger.error(`Job ${jobId} failed: ${error.message}`, error.stack);
            await this.storeResult(jobId, { error: error.message });
        }
    }

    @Get('result/:jobId')
    async getAnalysisResult(@Param('jobId') jobId: string) {
        const result = await this.getStoredResult(jobId);
        if (!result) {
            throw new NotFoundException('Result not ready');
        }
        if (result.error) {
            throw new InternalServerErrorException(result.error);
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