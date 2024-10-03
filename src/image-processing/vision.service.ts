import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';
import { GrammarService } from 'src/grammar/grammar.service';

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly apiKey: string;

  constructor(
    private configService: ConfigService,
    private grammarService: GrammarService
  ) {
    try {
      this.apiKey = this.configService.get('GOOGLE_CLOUD_API_KEY');
      if (!this.apiKey) {
        this.logger.error('GOOGLE_CLOUD_API_KEY is not set in the environment variables');
        throw new Error('GOOGLE_CLOUD_API_KEY is not set');
      }
    } catch (error) {
      this.logger.error(`Error in VisionService constructor: ${error.message}`);
      throw error;
    }
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<{ sentences: string[], boundingBoxes: any[], correctIndex: number, sentenceScores: number[] }> {
    this.logger.log(`Image buffer received. Size: ${imageBuffer.length} bytes`);

    try {
      const metadata = await sharp(imageBuffer).metadata();
      this.logger.log(`Image metadata: ${JSON.stringify(metadata)}`);

      const resizedBuffer = await sharp(imageBuffer)
        .resize({ width: 800, height: 800, fit: 'inside' })
        .jpeg({ quality: 90 })
        .toBuffer();

      const base64Image = resizedBuffer.toString('base64');

      const response = await axios.post(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: 'TEXT_DETECTION' }]
            }
          ]
        }
      );

      const detections = response.data.responses[0].textAnnotations || [];
      this.logger.log(`Number of text annotations: ${detections.length}`);

      if (detections.length === 0) {
        this.logger.warn('No text detected in the image');
        return { sentences: [], boundingBoxes: [], correctIndex: -1, sentenceScores: [] };
      }

      const fullText = detections[0].description || '';
      const sentences = fullText.split('\n')
        .map(s => s.trim())
        .filter(s => this.isValidSentence(s));

      const limitedSentences = sentences.slice(0, 5);

      // 첫 번째 요소는 전체 텍스트이므로 제외
      const textBlocks = detections.slice(1);

      const boundingBoxes = limitedSentences.map((sentence, index) => {
        const block = textBlocks.find(b => b.description.trim() === sentence.trim());
        if (block && block.boundingBox) {
          return {
            vertices: [
              { x: block.boundingBox.vertices[0].x / metadata.width, y: block.boundingBox.vertices[0].y / metadata.height },
              { x: block.boundingBox.vertices[1].x / metadata.width, y: block.boundingBox.vertices[1].y / metadata.height },
              { x: block.boundingBox.vertices[2].x / metadata.width, y: block.boundingBox.vertices[2].y / metadata.height },
              { x: block.boundingBox.vertices[3].x / metadata.width, y: block.boundingBox.vertices[3].y / metadata.height },
            ]
          };
        }
        return null;
      }).filter(box => box !== null);

      // GrammarService를 사용하여 각 문장의 점수를 얻습니다.
    const sentenceScores = await Promise.all(limitedSentences.map(sentence => 
      this.grammarService.evaluateSentence(sentence).then(result => result.score)
    ));

    // correctIndex 계산
    const correctIndex = await this.grammarService.findMostNaturalSentenceIndex(limitedSentences);

    this.logger.log(`Extracted sentences: ${limitedSentences.join(', ')}`);
    this.logger.log(`Sentence scores: ${sentenceScores.join(', ')}`);
    this.logger.log(`Correct index: ${correctIndex}`);
    this.logger.log(`Bounding boxes: ${JSON.stringify(boundingBoxes)}`);

    return { sentences: limitedSentences, boundingBoxes, correctIndex, sentenceScores };
    } catch (error) {
      this.logger.error(`Failed to analyze image: ${error.message}`, error.stack);
      if (error.response) {
        this.logger.error(`API response error: ${JSON.stringify(error.response.data)}`);
      }
      throw new InternalServerErrorException(`Image analysis failed: ${error.message}`);
    }
  }

  private isValidSentence(sentence: string): boolean {
    // 영어, 숫자, "올바른 문장을 선택해 주세요" 제외
    if (/^[a-zA-Z0-9\s]+$/.test(sentence) || 
        sentence === "올바른 문장을 선택해 주세요" ||
        /^\d+$/.test(sentence)) {
      return false;
    }

    // 한글이 포함된 문장만 유효하다고 판단
    return /[가-힣]/.test(sentence);
  }

  async detectTextWithRetry(imageBuffer: Buffer, maxRetries = 3): Promise<{ sentences: string[], boundingBoxes: any[] }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.detectTextInImage(imageBuffer);
      } catch (error) {
        if (error.code !== 2 || attempt === maxRetries) throw error;
        this.logger.warn(`Attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  private isValidImageFormat(buffer: Buffer): boolean {
    // JPEG 시그니처 확인
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return true;
    }
    // PNG 시그니처 확인
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return true;
    }
    return false;
  }
}