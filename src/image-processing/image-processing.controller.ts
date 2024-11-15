import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus, Get, Param, NotFoundException, InternalServerErrorException, Res } from '@nestjs/common';
import { Response } from 'express';  // Express Response 타입 추가
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';
import { v4 as uuidv4 } from 'uuid';
import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import * as sharp from 'sharp';
import { ENABLE_PERFORMANCE_LOGS } from 'src/constants/Logger.constants';

@Controller('image-processing')
export class ImageProcessingController {
  private readonly logger = new Logger(ImageProcessingController.name);

  constructor(
    private readonly visionService: VisionService,
    private readonly grammarService: GrammarService,
  ) { }

  @Post('analyze')
  @UseInterceptors(FileInterceptor('image'))
  async analyzeImage(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response
  ) {
    try {
      // SSE 헤더 설정
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // 초기 상태 전송
      res.write(`data: ${JSON.stringify({
        status: 'processing',
        message: '이미지 처리 시작...'
      })}\n\n`);

      // Vision API 호출
      const visionResult = await this.visionService.detectTextInImage(file.buffer);

      // 문장 인식 실패 시
      if (!visionResult.sentences || visionResult.sentences.length === 0) {
        this.logger.warn('No valid sentences found');
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: 'No text detected'
        })}\n\n`);
        return res.end();
      }

      // 문장 인식 결과 전송
      res.write(`data: ${JSON.stringify({
        type: 'sentences',
        data: {
          sentences: visionResult.sentences
        }
      })}\n\n`);

      // 문법 분석
      const grammarResult = await this.grammarService.findMostNaturalSentence(
        visionResult.sentences
      );

      // 최종 결과 전송
      res.write(`data: ${JSON.stringify({
        type: 'result',
        data: {
          sentences: visionResult.sentences,
          correctIndex: grammarResult.correctIndex,
          correctSentence: grammarResult.correctSentence,
          sentenceScores: grammarResult.sentenceScores
        }
      })}\n\n`);

      return res.end();

    } catch (error) {
      if (ENABLE_PERFORMANCE_LOGS) {
      this.logger.error('Analysis error:', error);
      }
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error.message || 'Analysis failed'
      })}\n\n`);
      return res.end();
    }
  }
}