import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { ResultStorageService } from './result-storage.service';

@Injectable()
@Processor('image-processing')
export class ImageProcessingProcessor {
    private readonly logger = new Logger(ImageProcessingProcessor.name);
    private results: Map<string, any> = new Map();

    constructor(
        private readonly visionService: VisionService,
        private readonly grammarService: GrammarService,
        private readonly resultStorageService: ResultStorageService
    ) { }

    @Process('processImage')
    async handleProcessImage(job: Job) {
      const { jobId, fileBuffer } = job.data;
      try {
        const { sentences, boundingBoxes } = await this.visionService.detectTextInImage(fileBuffer);
        const { correctSentence, correctIndex, sentenceScores } = await this.grammarService.findMostNaturalSentence(sentences);
        
        const result = {
          sentences,
          boundingBoxes,
          correctSentence,
          correctIndex: parseInt(correctIndex.toString()),
          sentenceScores: sentenceScores.map(score => parseFloat(score.toFixed(0)))
        };
        
        await this.resultStorageService.storeResult(jobId, result);
      } catch (error) {
        await this.resultStorageService.storeResult(jobId, { error: error.message });
      }
    }

}