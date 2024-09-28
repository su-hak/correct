import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient, protos } from '@google-cloud/vision';
import { setTimeout } from 'timers/promises';

type Vertex = protos.google.cloud.vision.v1.IVertex;

@Injectable()
export class VisionService {
  private client: ImageAnnotatorClient;
  private readonly logger = new Logger(VisionService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GOOGLE_CLOUD_API_KEY');
    this.client = new ImageAnnotatorClient({ apiKey });
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<string[]> {
    try {
      this.logger.log(`Starting text detection. Image buffer size: ${imageBuffer.length} bytes`);
      
      const detectionPromise = this.client.textDetection(imageBuffer);
      const timeoutPromise = setTimeout(60000, null);
      
      const result = await Promise.race([detectionPromise, timeoutPromise]);

      if (!result) {
        throw new Error('Vision API request timed out');
      }

      const [detectionResult] = result as [protos.google.cloud.vision.v1.IAnnotateImageResponse];
      this.logger.log('Text detection completed');

      const detections = detectionResult.textAnnotations || [];
      this.logger.log(`Number of text annotations: ${detections.length}`);
      
      if (detections.length === 0) {
        this.logger.warn('No text detected in the image');
        return [];
      }

      // 첫 번째 요소는 전체 텍스트이므로 제외
      const textBlocks = detections.slice(1);
      
      // 텍스트 블록 중에서 가장 큰 5개를 선택 (문장 박스라고 가정)
      const sortedBlocks = textBlocks.sort((a, b) => {
        const areaA = this.calculateArea(a.boundingPoly?.vertices as Vertex[]);
        const areaB = this.calculateArea(b.boundingPoly?.vertices as Vertex[]);
        return areaB - areaA;
      });

      const extractedSentences = sortedBlocks.slice(0, 5).map(block => block.description || '');
      this.logger.log(`Extracted sentences: ${extractedSentences.join(', ')}`);
      return extractedSentences;
    } catch (error) {
      this.logger.error(`Failed to analyze image: ${error.message}`, error.stack);
      if (error.response) {
        this.logger.error(`API response error: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  private calculateArea(vertices: Vertex[]): number {
    if (!vertices || vertices.length < 4) return 0;
    const [v0, , v2] = vertices;
    if (!v0?.x || !v0?.y || !v2?.x || !v2?.y) return 0;
    return Math.abs((v2.x - v0.x) * (v2.y - v0.y));
  }
}