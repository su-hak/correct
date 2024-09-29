import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient, protos } from '@google-cloud/vision';
import * as sharp from 'sharp';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

type Vertex = protos.google.cloud.vision.v1.IVertex;

@Injectable()
export class VisionService {
  private client: ImageAnnotatorClient;
  private readonly logger = new Logger(VisionService.name);

  constructor(private configService: ConfigService) {
    const credentials = JSON.parse(
      Buffer.from(this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64'), 'base64').toString('utf-8')
    );
    this.client = new ImageAnnotatorClient({
      credentials,
      timeout: 30000, // 30초 타임아웃
      retry: {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 10000
      }
    });
    this.logger.log('Vision client initialized with custom options');
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<{sentences: string[], boundingBoxes: any[]}> {
    const tempFilePath = path.join(os.tmpdir(), `image-${Date.now()}.jpg`);
    this.logger.log(`Image buffer received. Size: ${imageBuffer.length} bytes`);
    this.logger.log(`First few bytes: ${imageBuffer.slice(0, 10).toString('hex')}`);
    this.logger.log(`Detecting text in image, buffer size: ${imageBuffer?.length || 0} bytes`);
  
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer');
    }
  
    if (!this.isValidImageFormat(imageBuffer)) {
      throw new Error('Unsupported image format');
    }
  
    try {
      const metadata = await sharp(imageBuffer).metadata();
      this.logger.log(`Image metadata: ${JSON.stringify(metadata)}`);
  
      const jpegBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
      const convertedMetadata = await sharp(jpegBuffer).metadata();
      this.logger.log(`Converted JPEG metadata: ${JSON.stringify(convertedMetadata)}`);
  
      // JPEG 파일로 저장
      await fs.promises.writeFile(tempFilePath, jpegBuffer);
  
      const [result] = await this.client.textDetection(tempFilePath);
      const detections = result.textAnnotations || [];
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
      if (error.details) {
        this.logger.error(`Error details: ${error.details}`);
      }
      if (error.metadata) {
        this.logger.error(`Error metadata: ${JSON.stringify(error.metadata)}`);
      }
      console.error('Detailed error:', JSON.stringify(error, null, 2));
      throw new InternalServerErrorException(`Image analysis failed: ${error.message}`);
    } finally {
      await fs.promises.unlink(tempFilePath).catch(() => {});
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