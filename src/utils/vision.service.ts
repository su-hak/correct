import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient, protos } from '@google-cloud/vision';
import axios from 'axios';
import axiosRetry from 'axios-retry';

type Vertex = protos.google.cloud.vision.v1.IVertex;

@Injectable()
export class VisionService {
  private client: ImageAnnotatorClient;
  private readonly logger = new Logger(VisionService.name);
  private axiosInstance: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GOOGLE_CLOUD_API_KEY');
    this.client = new ImageAnnotatorClient({ apiKey });

    this.axiosInstance = axios.create({ timeout: 30000 });
    axiosRetry(this.axiosInstance, { retries: 3 });
  }

  async detectTextInImage(imageBuffer: Buffer): Promise<string[]> {
    try {
      this.logger.log(`Starting text detection. Image buffer size: ${imageBuffer.length} bytes`);

      const [result] = await this.axiosInstance.post(
        'https://vision.googleapis.com/v1/images:annotate',
        {
          requests: [
            {
              image: {
                content: imageBuffer.toString('base64'),
              },
              features: [{ type: 'TEXT_DETECTION' }],
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${this.configService.get<string>('GOOGLE_CLOUD_API_KEY')}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const detections = result.data.responses[0].textAnnotations || [];
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
      console.error('Detailed error:', JSON.stringify(error, null, 2));
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