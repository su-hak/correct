import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, InternalServerErrorException, Get, Param, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { VisionService } from './vision.service';
import { GrammarService } from 'src/grammar/grammar.service';

@Controller('image-processing')
export class ImageProcessingController {
    private readonly logger = new Logger(ImageProcessingController.name);

    constructor(
        @InjectQueue('image-processing') private readonly imageProcessingQueue: Queue,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly visionService: VisionService,
        private readonly grammarService: GrammarService
    ) { }

    @Post('analyze')
    @UseInterceptors(FileInterceptor('image'))
    async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        this.logger.log(`Received file: ${file ? 'yes' : 'no'}, size: ${file?.buffer?.length || 0} bytes`);
        if (!file || !file.buffer || file.buffer.length === 0) {
            throw new BadRequestException('Invalid file uploaded');
        }

        const jobId = uuidv4();
        
        // 이미지 처리를 즉시 시작하고 결과를 캐시에 저장
        this.processImageImmediately(jobId, file.buffer);

        return { jobId };
    }

    private async processImageImmediately(jobId: string, imageBuffer: Buffer) {
        try {
            const { sentences, boundingBoxes } = await this.visionService.detectTextInImage(imageBuffer);

            if (sentences.length === 0) {
                await this.cacheManager.set(jobId, { status: 'no_text_detected' }, 3600);
                return;
            }

            // 문법 검사를 병렬로 수행
            const grammarChecks = await Promise.all(sentences.map(sentence => 
                this.grammarService.evaluateSentence(sentence)
            ));

            let maxScore = -1;
            let correctIndex = 0;
            grammarChecks.forEach((check, index) => {
                if (check.score > maxScore) {
                    maxScore = check.score;
                    correctIndex = index;
                }
            });

            const result = {
                sentences,
                boundingBoxes,
                correctSentence: sentences[correctIndex],
                correctIndex
            };

            await this.cacheManager.set(jobId, result, 3600);
        } catch (error) {
            this.logger.error(`Error processing image for jobId: ${jobId}`, error.stack);
            await this.cacheManager.set(jobId, { status: 'error', message: error.message }, 3600);
        }
    }

    @Get('result/:jobId')
    async getAnalysisResult(@Param('jobId') jobId: string) {
        this.logger.log(`Fetching result for jobId: ${jobId}`);

        const cachedResult = await this.cacheManager.get(jobId);
        if (cachedResult) {
            return cachedResult;
        }

        return { status: 'processing' };
    }
}