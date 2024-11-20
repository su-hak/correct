// shared/optimized-http.service.ts
import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as dns from 'dns';
import * as https from 'https';  // 수정된 부분

@Injectable()
export class OptimizedHttpService {
  private dnsCache = new Map();
  private agent: https.Agent;

  constructor() {
    this.agent = new https.Agent({
      keepAlive: true,
      maxSockets: 100,
      keepAliveMsecs: 10000
    });
  }

  createAxiosInstance(baseURL: string): AxiosInstance {
    dns.setDefaultResultOrder('ipv4first');

    const axiosInstance = axios.create({
      baseURL,
      timeout: 10000,
      httpsAgent: this.agent,
      headers: {
        'Connection': 'keep-alive'
      }
    });

    axiosInstance.interceptors.request.use(async (config) => {
      const url = new URL(config.url);
      if (!this.dnsCache.has(url.host)) {
        const address = await dns.promises.resolve(url.host);
        this.dnsCache.set(url.host, address[0]);
      }
      config.url = config.url.replace(url.host, this.dnsCache.get(url.host));
      return config;
    });

    return axiosInstance;
  }
}