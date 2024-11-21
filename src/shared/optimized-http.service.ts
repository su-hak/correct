// optimized-http.service.ts
import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as dns from 'dns';
import * as https from 'https';
import * as http from 'http';
import * as http2 from 'http2';

const client = http2.connect('https://vision.googleapis.com');

@Injectable()
export class OptimizedHttpService {
    private dnsCache = new Map();
    private keepAliveAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 50,
        timeout: 60000,
        scheduling: 'lifo',
        noDelay: true,  // TCP_NODELAY 활성화
    });

    async requestWithRetry(config: AxiosRequestConfig): Promise<any> {
        const startTime = Date.now();
        
        // DNS 캐싱
        const url = new URL(config.url);
        if (!this.dnsCache.has(url.hostname)) {
            const addresses = await dns.promises.resolve4(url.hostname);
            this.dnsCache.set(url.hostname, addresses[0]);
        }
        
        const optimizedConfig: AxiosRequestConfig = {
            ...config,
            httpsAgent: this.keepAliveAgent,
            headers: {
                ...config.headers,
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Host': this.dnsCache.get(url.hostname)
            },
            decompress: true,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024,
            responseType: 'stream' as any,  // 응답 스트리밍
            onUploadProgress: (e) => console.log(`Upload speed: ${e.loaded / (Date.now() - startTime)} KB/s`),
            onDownloadProgress: (e) => console.log(`Download speed: ${e.loaded / (Date.now() - startTime)} KB/s`)
        };

        try {
            const response = await axios(optimizedConfig);
            return response;
        } catch (error) {
            console.error('Network metrics:', {
                time: Date.now() - startTime,
                host: url.hostname,
                cached: this.dnsCache.has(url.hostname)
            });
            throw error;
        }
    }
}