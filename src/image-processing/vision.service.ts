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
    // Base64로 인코딩된 환경 변수에서 값을 가져옴
    const encodedCredentials = this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64');
  
    // Base64 디코딩하여 JSON 문자열로 변환
    const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
    
    // 디코딩된 JSON 내용을 로그로 출력 (확인용)
    console.log('Decoded Credentials:', decodedCredentials);
  
    // JSON 파싱
    const credentials = JSON.parse(decodedCredentials);
    
    // Google Cloud Vision Client 생성
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
  
    // 클라이언트 초기화 로그
    this.logger.log('Vision client initialized with custom options');
  }
  

  async detectTextInImage(imageBuffer: Buffer): Promise<{sentences: string[], boundingBoxes: any[]}> {
    this.logger.log(`Image buffer received. Size: ${imageBuffer.length} bytes`);
    this.logger.log(`First few bytes: ${imageBuffer.slice(0, 10).toString('hex')}`);

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer');
    }

    try {
      const metadata = await sharp(imageBuffer).metadata();
      this.logger.log(`Image metadata: ${JSON.stringify(metadata)}`);

      // 이미지 크기 조정 및 PNG로 변환
      const resizedBuffer = await sharp(imageBuffer)
        .resize({ width: 1000, height: 1000, fit: 'inside' })
        .png()
        .toBuffer();

      const convertedMetadata = await sharp(resizedBuffer).metadata();
      this.logger.log(`Converted PNG metadata: ${JSON.stringify(convertedMetadata)}`);

      // Base64로 인코딩
      const base64Image = resizedBuffer.toString('base64');

      const [result] = await this.client.textDetection({
        image: { content: base64Image }
      });

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
    }
  }

  async detectTextWithRetry(imageBuffer: Buffer, maxRetries = 3): Promise<{sentences: string[], boundingBoxes: any[]}> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.detectTextInImage(imageBuffer);
      } catch (error) {
        if (attempt === maxRetries) throw error;
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