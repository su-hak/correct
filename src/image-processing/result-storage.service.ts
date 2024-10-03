import { Injectable } from "@nestjs/common";

@Injectable()
export class ResultStorageService {
  private results: Map<string, any> = new Map();

  async storeResult(jobId: string, result: any): Promise<void> {
    this.results.set(jobId, result);
    console.log(`Stored result for job ${jobId}: ${JSON.stringify(result)}`);
  }

  async getResult(jobId: string): Promise<any> {
    const result = this.results.get(jobId);
    console.log(`Retrieved result for job ${jobId}: ${JSON.stringify(result)}`);
    return result;
  }
}