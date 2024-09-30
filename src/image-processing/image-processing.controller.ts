import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull'

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
        const jobId = uuidv4();

        // 파일 버퍼를 Base64로 인코딩
        const base64Image = file.buffer.toString('base64');

        await this.imageProcessingQueue.add('processImage', { jobId, base64Image });

        // 작업 시작 후 결과를 기다립니다
        let result;
        for (let i = 0; i < 20; i++) {  // 최대 20초 대기
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
            result = await this.getStoredResult(jobId);
            if (result) break;
        }

        if (!result) {
            throw new InternalServerErrorException('Failed to process image in time');
        }

        return result;
    } catch(error) {
        this.logger.error(`Failed to analyze image: ${error.message}`, error.stack);
        if (error.response) {
            this.logger.error(`API response error: ${JSON.stringify(error.response.data)}`);
        }
        throw new InternalServerErrorException(`Image analysis failed: ${error.message}`);
    }


    @Get('result/:jobId')
    async getAnalysisResult(@Param('jobId') jobId: string) {
        const result = await this.getStoredResult(jobId);
        if (!result) {
            throw new NotFoundException('Analysis result not found or not ready yet');
        }
        if (result.error) {
            throw new BadRequestException(result.error);
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