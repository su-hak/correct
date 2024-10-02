import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, InternalServerErrorException, Get, Param, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Controller('image-processing')
export class ImageProcessingController {
    private readonly logger = new Logger(ImageProcessingController.name);

    constructor(
        private readonly visionService: VisionService,
        private readonly grammarService: GrammarService,
        @InjectQueue('image-processing') private readonly imageProcessingQueue: Queue,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) { }

    @Post('analyze')
    @UseInterceptors(FileInterceptor('image'))
    async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        this.logger.log(`Received file: ${file ? 'yes' : 'no'}, size: ${file?.buffer?.length || 0} bytes`);
        if (!file || !file.buffer || file.buffer.length === 0) {
            throw new BadRequestException('Invalid file uploaded');
        }

        const jobId = uuidv4();
        await this.imageProcessingQueue.add('processImage', {
            jobId,
            base64Image: file.buffer.toString('base64')
        }, { removeOnComplete: true });

        return { jobId };
    }

    @Get('result/:jobId')
    async getAnalysisResult(@Param('jobId') jobId: string) {
        const cachedResult = await this.cacheManager.get(jobId);
        if (cachedResult) {
            return cachedResult;
        }

        const job = await this.imageProcessingQueue.getJob(jobId);
        if (!job) {
            throw new NotFoundException('Job not found');
        }

        if (await job.isCompleted()) {
            const result = job.returnvalue;
            await this.cacheManager.set(jobId, result, 3600); // Cache for 1 hour
            return result;
        } else if (await job.isFailed()) {
            throw new InternalServerErrorException('Job failed');
        } else {
            return { status: 'processing' };
        }
    }
}