import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';

@Injectable()
@Processor('image-processing')
export class ImageProcessingProcessor {
    private readonly logger = new Logger(ImageProcessingProcessor.name);
    private results: Map<string, any> = new Map();

    constructor(
        private readonly visionService: VisionService,
        private readonly grammarService: GrammarService
    ) { }

    @Process('processImage')
    async handleProcessImage(job: Job) {
        this.logger.log(`Processing image job ${job.id}`);
        const { jobId, base64Image } = job.data;
        this.logger.log(`Processing job ${jobId}, image data length: ${base64Image?.length || 0}`);

        if (!base64Image) {
            throw new Error('Invalid image data');
        }

        try {
            // Base64를 버퍼로 변환
            const imageBuffer = Buffer.from(base64Image, 'base64');

            // 이미지 처리 로직...
            const sentences = await this.visionService.detectTextInImage(imageBuffer);

            if (sentences.length !== 5) {
                throw new Error('Expected 5 sentences, but got ' + sentences.length);
            }

            // 문법 검사 및 올바른 문장 찾기
            const { correctSentence, correctIndex } = await this.grammarService.checkGrammar(sentences);

            // 결과 저장
            const result = {
                sentences,
                correctSentence,
                correctIndex
            };
            await this.storeResult(jobId, result);

            this.logger.log(`Job ${job.id} completed successfully`);
        } catch (error) {
            this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
            await this.storeResult(jobId, { error: error.message });
        }
    }

    private async storeResult(jobId: string, result: any): Promise<void> {
        this.results.set(jobId, result);
    }
}