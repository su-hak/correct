/* import { Process, Processor } from '@nestjs/bull';
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

            const { sentences, boundingBoxes } = await this.visionService.detectTextInImage(imageBuffer);

            if (sentences.length === 0) {
                throw new Error('No sentences detected in the image');
            }

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

            return result;
        } catch (error) {
            this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
            throw error;
        }
    }
} */