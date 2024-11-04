import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { Cache, CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
@Processor('image-processing')
export class ImageProcessingProcessor {
    private readonly logger = new Logger(ImageProcessingProcessor.name);

    constructor(
        private readonly visionService: VisionService,
        private readonly grammarService: GrammarService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) { }

    @Process('processImage')
async handleProcessImage(job: Job) {
    this.logger.log(`Processing image job ${job.id}`);
    const { jobId, base64Image } = job.data;

    try {
        const imageBuffer = Buffer.from(base64Image, 'base64');

        // Parallel processing of text detection
        const { sentences, boundingBoxes, correctIndex, sentenceScores } = await this.visionService.detectTextInImage(imageBuffer);

        if (sentences.length === 0) {
            throw new Error('No sentences detected in the image');
        }

        const result = {
            sentences,
            boundingBoxes,
            correctSentence: sentences[correctIndex],
            correctIndex,
            sentenceScores
        };

        await this.cacheManager.set(jobId, result, 3600); // Cache for 1 hour

        return result;
    } catch (error) {
        this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
        throw error;
    }
}
}