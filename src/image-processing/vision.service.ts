import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as sharp from 'sharp';

export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get('GOOGLE_CLOUD_API_KEY');
    if (!this.apiKey) {
      throw new Error('GOOGLE_CLOUD_API_KEY is not set in the environment variables');
    }
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<{ sentences: string[], boundingBoxes: any[] }> {
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
        return { sentences: [], boundingBoxes: [] };
      }

      const fullText = detections[0].description || '';
      const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
      const limitedSentences = sentences.slice(0, 5);

      // 첫 번째 요소는 전체 텍스트이므로 제외
      const textBlocks = detections.slice(1);

      const boundingBoxes = limitedSentences.map(sentence => {
        const block = textBlocks.find(b => b.description.includes(sentence));
        if (block && block.boundingPoly && block.boundingPoly.vertices) {
          return {
            vertices: block.boundingPoly.vertices.map(v => ({
              x: v.x / metadata.width,
              y: v.y / metadata.height
            }))
          };
        }
        return null;
      }).filter(box => box !== null);

      this.logger.log(`Extracted sentences: ${limitedSentences.join(', ')}`);
      return { sentences: limitedSentences, boundingBoxes };
    } catch (error) {
      this.logger.error(`Failed to analyze image: ${error.message}`, error.stack);
      if (error.response) {
        this.logger.error(`API response error: ${JSON.stringify(error.response.data)}`);
      }
      throw new InternalServerErrorException(`Image analysis failed: ${error.message}`);
    }
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