import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    // Google Cloud API 키를 환경 변수에서 가져옵니다.
    this.apiKey = this.configService.get<string>('GOOGLE_CLOUD_API_KEY');
    if (!this.apiKey) {
      throw new Error('GOOGLE_CLOUD_API_KEY is not set in the environment variables');
    }
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<{ sentences: string[], boundingBoxes: any[] }> {
    this.logger.log(`Image buffer received. Size: ${imageBuffer.length} bytes`);

    try {
      const metadata = await sharp(imageBuffer).metadata();
      this.logger.log(`Image metadata: ${JSON.stringify(metadata)}`);

      // 이미지를 JPEG로 변환하고 크기를 조정합니다.
      const resizedBuffer = await sharp(imageBuffer)
        .resize({ width: 800, height: 800, fit: 'inside' })
        .jpeg({ quality: 90 })
        .toBuffer();

      // Base64로 인코딩
      const base64Image = resizedBuffer.toString('base64');

      // Google Cloud Vision API에 직접 HTTP 요청
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
        return { sentences: [], boundingBoxes: [] };
      }

      // 첫 번째 요소는 전체 텍스트이므로 제외
      const textBlocks = detections.slice(1);

      // 상단에서 하단으로 정렬
      const sortedBlocks = textBlocks.sort((a, b) => {
        return (a.boundingPoly?.vertices?.[0]?.y || 0) - (b.boundingPoly?.vertices?.[0]?.y || 0);
      });

      const extractedSentences = sortedBlocks.map(block => block.description || '');
      const boundingBoxes = sortedBlocks.map(block => block.boundingPoly);

      this.logger.log(`Extracted sentences: ${extractedSentences.join(', ')}`);
      return { sentences: extractedSentences, boundingBoxes };
    } catch (error) {
      this.logger.error(`Failed to analyze image: ${error.message}`, error.stack);
      if (error.response) {
        this.logger.error(`API response error: ${JSON.stringify(error.response.data)}`);
      }
      throw new InternalServerErrorException(`Image analysis failed: ${error.message}`);
    }
  }

  async detectTextWithRetry(imageBuffer: Buffer, maxRetries = 3): Promise<{sentences: string[], boundingBoxes: any[]}> {
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