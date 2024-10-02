import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, InternalServerErrorException, Get, Param, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
        this.logger.log(`Fetching result for jobId: ${jobId}`);

        try {
            // 캐시에서 결과 확인
            const cachedResult = await this.cacheManager.get(jobId);
            if (cachedResult) {
                this.logger.log(`Cached result found for jobId: ${jobId}`);
                return cachedResult;
            }

            // 작업 상태 확인
            const job = await this.imageProcessingQueue.getJob(jobId);
            if (!job) {
                this.logger.warn(`Job not found for jobId: ${jobId}`);
                throw new NotFoundException('Job not found');
            }

            if (await job.isCompleted()) {
                const result = job.returnvalue;
                this.logger.log(`Job completed for jobId: ${jobId}`);
                await this.cacheManager.set(jobId, result, 3600); // 1시간 동안 캐시
                return result;
            } else if (await job.isFailed()) {
                this.logger.error(`Job failed for jobId: ${jobId}`);
                throw new InternalServerErrorException('Job failed');
            } else {
                this.logger.log(`Job still processing for jobId: ${jobId}`);
                return { status: 'processing' };
            }
        } catch (error) {
            this.logger.error(`Error fetching result for jobId: ${jobId}`, error.stack);
            if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
                throw error;
            }
            throw new InternalServerErrorException('An unexpected error occurred');
        }
    }
}