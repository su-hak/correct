import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';


@Injectable()
export class PetStatService {
  private readonly logger = new Logger(PetStatService.name);
  private readonly openaiApiKey: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService
  ) {
    this.openaiApiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async extractPetStats(imageBase64: string): Promise<PetStats> {
    try {
      const response = await lastValueFrom(this.httpService.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                { 
                  type: "text", 
                  text: "이 이미지에서 '현재: 공 [숫자] ([숫자]), 방 [숫자] ([숫자]), 순 [숫자] ([숫자]), 내 [숫자] ([숫자])' 형식의 텍스트를 찾아 공, 방, 순, 내의 첫 번째 숫자만 추출해주세요. 숫자만 응답하세요." 
                },
                { 
                  type: "image_url", 
                  image_url: { url: `data:image/png;base64,${imageBase64}` } 
                }
              ]
            }
          ],
          max_tokens: 60,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      ));

      const content = response.data.choices[0].message.content.trim();
      const stats = this.parseStats(content);

      this.logger.log(`Extracted stats: ${JSON.stringify(stats)}`);
      
      return stats;
    } catch (error) {
      this.logger.error(`Failed to extract pet stats: ${error.message}`, error.stack);
      throw new Error("펫 스탯 추출 중 오류 발생");
    }
  }

  private parseStats(content: string): PetStats {
    const stats: PetStats = { 공: 0, 방: 0, 순: 0, 내: 0 };
    const numbers = content.match(/\d+/g);
    if (numbers && numbers.length >= 4) {
      stats.공 = parseInt(numbers[0], 10);
      stats.방 = parseInt(numbers[1], 10);
      stats.순 = parseInt(numbers[2], 10);
      stats.내 = parseInt(numbers[3], 10);
    }
    return stats;
  }
}