import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull'
import * as sharp from 'sharp';

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
        // 1. 이미지 크기 검증 및 최적화
        if (!file || file.size > 5 * 1024 * 1024) { // 5MB 제한
            throw new BadRequestException('File too large');
        }

        // 2. 이미지 압축 및 최적화
        const optimizedBuffer = await sharp(file.buffer)
            .resize(800, null, { 
                fit: 'inside',
                withoutEnlargement: true 
            })
            .jpeg({ 
                quality: 80,
                chromaSubsampling: '4:2:0' // 메모리 사용량 감소
            })
            .toBuffer();

        // 3. 문장 텍스트 추출 및 구문분석 병렬 처리
        const visionResult = await Promise.race([
            this.visionService.detectTextInImage(optimizedBuffer),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Vision API Timeout')), 3000)
            )
        ]) as any;

        if (!visionResult.sentences.length) {
            return {
                sentences: [],
                boundingBoxes: [],
                correctIndex: -1,
                correctSentence: '',
                sentenceScores: []
            };
        }

        // 4. 문법 검사 최적화
        const grammarResult = await Promise.race([
            this.grammarService.findMostNaturalSentence(visionResult.sentences),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Grammar Analysis Timeout')), 2000)
            )
        ]) as any;

        return {
            sentences: visionResult.sentences,
            boundingBoxes: visionResult.boundingBoxes,
            correctSentence: grammarResult.correctSentence || visionResult.sentences[0],
            correctIndex: grammarResult.correctIndex,
            sentenceScores: grammarResult.sentenceScores
        };

    } catch (error) {
        // 5. 메모리 정리
        this.logger.error('Image analysis error:', {
            message: error.message,
            statusCode: error.status
        });
        
        if (error.message.includes('Timeout')) {
            throw new HttpException('Processing time exceeded', HttpStatus.REQUEST_TIMEOUT);
        }
        
        throw new InternalServerErrorException('Analysis failed');
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