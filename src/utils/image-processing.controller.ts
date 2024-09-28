import { Controller, Post, UseInterceptors, UploadedFile, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VisionService } from './vision.service';
import { GrammarService } from '../grammar/grammar.service';

@Controller('image-processing')
export class ImageProcessingController {
    private readonly logger = new Logger(ImageProcessingController.name);

    constructor(
        private visionService: VisionService,
        private grammarService: GrammarService,
    ) { }

    @Post('analyze')
    @UseInterceptors(FileInterceptor('image'))
    async analyzeImage(@UploadedFile() file: Express.Multer.File) {
        try {
            this.logger.log(`Received file: ${file.originalname}, size: ${file.size} bytes`);

            if (!file.buffer || file.buffer.length === 0) {
                throw new BadRequestException('Empty file received');
            }

            const sentences = await this.visionService.detectTextInImage(file.buffer);
            this.logger.log(`Detected sentences: ${sentences.join(', ')}`);

            const { correctSentence, correctIndex } = await this.grammarService.checkGrammar(sentences);
            this.logger.log(`Grammar check result: ${correctSentence} at index ${correctIndex}`);

            return {
                sentences,
                correctSentence,
                correctIndex,
            };
        } catch (error) {
            this.logger.error(`Failed to analyze image: ${error.message}`, error.stack);
            if (error instanceof HttpException) {
                throw error;
            } else if (error instanceof Error) {
                throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
            } else {
                throw new HttpException('An unknown error occurred', HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
    }
}