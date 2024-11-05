import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull'
import sharp from 'sharp';

@Controller('image-processing')
export class ImageProcessingController {
    private readonly logger = new Logger(ImageProcessingController.name);
    private results: Map<string, any> = new Map();

    constructor(
        private readonly visionService: VisionService,
        private readonly grammarService: GrammarService,
        @InjectQueue('image-processing') private readonly imageProcessingQueue: Queue
    ) { }

    // ImageProcessingController 수정
    @Post('analyze')
    @UseInterceptors(FileInterceptor('image'))
    async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        try {
            // 1. 이미지 사전 최적화
            const optimizedBuffer = await sharp(file.buffer)
                .resize(800, null, {  // 너비만 지정하여 비율 유지
                    withoutEnlargement: true,
                    fit: 'inside',
                })
                .jpeg({ quality: 80 })
                .toBuffer();

            // 2. Vision API와 Grammar 검사 병렬 처리
            const [visionResult] = await Promise.all([
                this.visionService.detectTextInImage(optimizedBuffer),
            ]);

            // 3. 문장이 없는 경우 빠른 반환
            if (!visionResult.sentences.length) {
                return {
                    sentences: [],
                    boundingBoxes: [],
                    correctIndex: -1,
                    correctSentence: '',
                    sentenceScores: []
                };
            }

            // 4. Grammar 검사는 필요한 경우에만
            const grammarResult = await this.grammarService
                .findMostNaturalSentence(visionResult.sentences);

            return {
                sentences: visionResult.sentences,
                boundingBoxes: visionResult.boundingBoxes,
                correctSentence: grammarResult.correctSentence,
                correctIndex: grammarResult.correctIndex,
                sentenceScores: grammarResult.sentenceScores
            };

        } catch (error) {
            throw new InternalServerErrorException(
                `Image analysis failed: ${error.message}`
            );
        }
    }

    @Get('result/:jobId')
    async getAnalysisResult(@Param('jobId') jobId: string) {
        const result = await this.getStoredResult(jobId);
        if (!result) {
            throw new NotFoundException('Result not ready');
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