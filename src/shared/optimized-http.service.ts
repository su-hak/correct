import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as dns from 'dns';
import * as https from 'https';
import { OutgoingHttpHeaders } from 'http2';

@Injectable()
export class OptimizedHttpService {
    private dnsCache = new Map();
    private axiosInstances = new Map<string, AxiosInstance>();

    private getAxiosInstance(hostname: string): AxiosInstance {
        if (!this.axiosInstances.has(hostname)) {
            const instance = axios.create({
                httpsAgent: new https.Agent({
                    keepAlive: true,
                    keepAliveMsecs: 1000,
                    maxSockets: 50,
                    timeout: 30000,
                    scheduling: 'fifo',
                    noDelay: true,
                    rejectUnauthorized: true,
                    ALPNProtocols: ['h2', 'http/1.1']
                }),
                timeout: 30000,
                decompress: true,
                maxContentLength: 50 * 1024 * 1024,
                maxBodyLength: 50 * 1024 * 1024,
                headers: {
                    'Accept-Encoding': 'br, gzip, deflate',
                    'Connection': 'keep-alive'
                }
            });
            this.axiosInstances.set(hostname, instance);
        }
        return this.axiosInstances.get(hostname);
    }

    async request(config: AxiosRequestConfig): Promise<any> {
        const startTime = Date.now();
        const url = new URL(config.url);
        let uploadSize = 0;
        let downloadSize = 0;
        let lastProgressTime = Date.now();
        const progressInterval = 1000; // 1초마다 속도 업데이트

        // DNS 캐싱
        if (!this.dnsCache.has(url.hostname)) {
            try {
                const addresses = await dns.promises.resolve4(url.hostname);
                this.dnsCache.set(url.hostname, addresses[0]);
            } catch (error) {
                console.error(`DNS resolution failed for ${url.hostname}:`, error);
            }
        }

        const instance = this.getAxiosInstance(url.hostname);
        
        const optimizedConfig: AxiosRequestConfig = {
            ...config,
            headers: {
                ...config.headers,
                'Host': url.hostname,
            },
            onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    uploadSize = progressEvent.loaded;
                    const speed = (uploadSize * 1000) / ((Date.now() - startTime) * 1024);
                    console.log(`Upload speed: ${speed.toFixed(1)} KB/s`);
                }
            },
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    downloadSize = progressEvent.loaded;
                    const speed = (downloadSize * 1000) / ((Date.now() - startTime) * 1024);
                    console.log(`Download speed: ${speed.toFixed(1)} KB/s`);
                }
            }
        };

        try {
            const response = await instance(optimizedConfig);
            
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000; // 초 단위
            
            // 최종 속도 계산
            const finalUploadSpeed = (uploadSize / 1024) / duration;
            const finalDownloadSpeed = (downloadSize / 1024) / duration;
            
            console.log('Network metrics:', {
                time: endTime - startTime,
                host: url.hostname,
                cached: this.dnsCache.has(url.hostname),
                status: response.status,
                uploadSpeed: `${finalUploadSpeed.toFixed(1)} KB/s`,
                downloadSpeed: `${finalDownloadSpeed.toFixed(1)} KB/s`,
                totalSize: `${(downloadSize / 1024).toFixed(1)} KB`
            });

            return response;
        } catch (error) {
            console.error('Request failed:', {
                url: url.hostname,
                error: error.message,
                duration: Date.now() - startTime
            });
            throw error;
        }
    }
}