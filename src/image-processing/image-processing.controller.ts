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
    @UseInterceptors(FileInterceptor('image'))
    async analyzeImage(
        @UploadedFile() file: Express.Multer.File,
        @Res() res: Response
    ) {
        try {
            // 1. SSE 헤더 설정
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // 2. Vision API 호출 및 즉시 응답
            const visionResult = await this.visionService.detectTextInImage(file.buffer);
            res.write(`data: ${JSON.stringify({
                type: 'sentences',
                data: visionResult.sentences
            })}\n\n`);
            
            // 3. 문장이 없는 경우 즉시 종료
            if (!visionResult.sentences.length) {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    message: 'No text detected'
                })}\n\n`);
                return res.end();
            }

            // 4. GPT 분석 및 즉시 응답
            const grammarResult = await this.grammarService.findMostNaturalSentence(
                visionResult.sentences
            );
            res.write(`data: ${JSON.stringify({
                type: 'analysis',
                data: {
                    correctIndex: grammarResult.correctIndex,
                    correctSentence: grammarResult.correctSentence,
                    sentenceScores: grammarResult.sentenceScores
                }
            })}\n\n`);

            return res.end();

        } catch (error) {
            this.logger.error('Analysis error:', error);
            res.write(`data: ${JSON.stringify({
                type: 'error',
                message: 'Analysis failed'
            })}\n\n`);
            return res.end();
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