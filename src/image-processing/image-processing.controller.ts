import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException, Res } from '@nestjs/common';
import { Response } from 'express';  // Express Response 타입 추가
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
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

    @Post('analyze')
    async analyzeImage(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
        // 1. 빠른 응답 시작
        res.setHeader('Content-Type', 'text/event-stream');
        
        try {
            // 2. 이미지 처리 시작
            const optimizedBuffer = await sharp(file.buffer)
                .resize(800, null)
                .jpeg({ quality: 80 })
                .toBuffer();
    
            // 3. Vision API 호출과 동시에 이미지 메타데이터 응답
            const [visionResult] = await Promise.all([
                this.visionService.detectTextInImage(optimizedBuffer),
                res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`)
            ]);
    
            // 4. 문장 목록 즉시 전송
            res.write(`data: ${JSON.stringify({
                type: 'sentences',
                data: visionResult.sentences
            })}\n\n`);
    
            // 5. GPT 분석 시작
            const grammarPromise = this.grammarService.findMostNaturalSentence(visionResult.sentences);
            
            // 6. 중간 상태 전송
            res.write(`data: ${JSON.stringify({ type: 'analyzing' })}\n\n`);
            
            // 7. GPT 결과 수신 및 전송
            const grammarResult = await grammarPromise;
            res.write(`data: ${JSON.stringify({
                type: 'complete',
                data: grammarResult
            })}\n\n`);
            
        } catch (error) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: error.message
            })}\n\n`);
        }
        
        res.end();
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