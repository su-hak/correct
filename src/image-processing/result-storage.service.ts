import { Injectable } from "@nestjs/common";

@Injectable()
export class ResultStorageService {
  private results: Map<string, any> = new Map();

  async storeResult(jobId: string, result: any): Promise<void> {
    this.results.set(jobId, result);
  }

  async getResult(jobId: string): Promise<any> {
    return this.results.get(jobId);
  }
}