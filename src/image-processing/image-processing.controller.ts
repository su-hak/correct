import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, Get, Param, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';

@Controller('image-processing')
export class ImageProcessingController {
    private readonly logger = new Logger(ImageProcessingController.name);
    private results: Map<string, any> = new Map();

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
    
        const jobId = uuidv4();

        // 비동기로 이미지 처리 시작
        this.processImageAsync(jobId, file.buffer);

        return { jobId };
    }

    private async processImageAsync(jobId: string, imageBuffer: Buffer) {
        try {
            const { sentences, boundingBoxes } = await this.visionService.detectTextInImage(imageBuffer);
            
            if (sentences.length === 0) {
                await this.storeResult(jobId, { status: 'completed', result: { sentences: [], boundingBoxes: [], correctSentence: '', correctIndex: -1 } });
                return;
            }

            const { correctSentence, correctIndex, sentenceScores } = await this.grammarService.findMostNaturalSentence(sentences);

            const result = {
                sentences,
                boundingBoxes,
                correctSentence,
                correctIndex,
                sentenceScores
            };

            await this.storeResult(jobId, { status: 'completed', result });
        } catch (error) {
            this.logger.error(`Error processing image for jobId: ${jobId}`, error.stack);
            await this.storeResult(jobId, { status: 'error', message: error.message });
        }
    }

    @Get('result/:jobId')
    async getAnalysisResult(@Param('jobId') jobId: string) {
        const result = await this.getStoredResult(jobId);
        if (!result) {
            throw new NotFoundException('Result not found');
        }
        if (result.status === 'error') {
            throw new InternalServerErrorException(result.message);
        }
        if (result.status === 'completed') {
            return result.result;
        }
        return { status: 'processing' };
    }

    private async storeResult(jobId: string, result: any): Promise<void> {
        this.results.set(jobId, result);
    }

    private async getStoredResult(jobId: string): Promise<any> {
        return this.results.get(jobId);
    }
}