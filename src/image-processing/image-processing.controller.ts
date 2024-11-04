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
    @UseInterceptors(FileInterceptor('image', {
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 제한
        fileFilter: (req, file, callback) => {
            if (!file.mimetype.match(/^image\/(jpeg|png|jpg)$/)) {
                return callback(new BadRequestException('Only image files are allowed'), false);
            }
            callback(null, true);
        }
    }))
    async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        try {
            this.logger.debug(`File details: 
                Mimetype: ${file?.mimetype}
                Size: ${file?.size} bytes
                Original name: ${file?.originalname}
            `);

            if (!file || !file.buffer || file.buffer.length === 0) {
                throw new BadRequestException('Invalid file uploaded');
            }

            // 이미지 파일 검증
            if (!this.isValidImageBuffer(file.buffer)) {
                throw new BadRequestException('Invalid image format');
            }

            const startTime = Date.now();
            
            // Vision API 호출 및 결과 로깅
            const visionResult = await this.visionService.detectTextInImage(file.buffer);
            
            this.logger.debug(`Vision API Response:
                Processing time: ${Date.now() - startTime}ms
                Detected sentences: ${JSON.stringify(visionResult.sentences)}
                Number of sentences: ${visionResult.sentences.length}
                Bounding boxes: ${JSON.stringify(visionResult.boundingBoxes)}
            `);

            // 문장이 없는 경우 상세 로그
            if (!visionResult.sentences.length) {
                throw new HttpException({
                    status: HttpStatus.NO_CONTENT,
                    error: 'No text detected in the image',
                    details: 'The image might be too blurry, poorly lit, or contain no Korean text'
                }, HttpStatus.NO_CONTENT);
            }

            // 문법 검사
            const grammarResult = await this.grammarService.findMostNaturalSentence(visionResult.sentences);

            const response = {
                sentences: visionResult.sentences,
                boundingBoxes: visionResult.boundingBoxes,
                correctSentence: grammarResult.correctSentence || visionResult.sentences[0],
                correctIndex: grammarResult.correctIndex,
                sentenceScores: grammarResult.sentenceScores
            };

            this.logger.debug(`Final response: ${JSON.stringify(response)}`);

            return response;

        } catch (error) {
            this.logger.error('Image analysis error:', {
                error: error.message,
                stack: error.stack,
                statusCode: error.status
            });

            if (error.status === HttpStatus.NO_CONTENT) {
                return {
                    sentences: [],
                    boundingBoxes: [],
                    correctSentence: '',
                    correctIndex: -1,
                    sentenceScores: []
                };
            }

            throw new InternalServerErrorException(
                `Image analysis failed: ${error.message}`
            );
        }
    }

    private isValidImageBuffer(buffer: Buffer): boolean {
        // JPEG 확인
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
            return true;
        }
        // PNG 확인
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            return true;
        }
        return false;
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