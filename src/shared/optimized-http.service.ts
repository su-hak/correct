import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as http2 from 'http2';
import * as https from 'https';

const client = http2.connect('https://vision.googleapis.com');

@Injectable()
export class OptimizedHttpService {
    private axiosInstances = new Map<string, AxiosInstance>();

    private getAxiosInstance(hostname: string): AxiosInstance {
        if (!this.axiosInstances.has(hostname)) {
            const instance = axios.create({
                httpsAgent: new https.Agent({
                    keepAlive: true,
                    keepAliveMsecs: 1000,
                    maxSockets: 10,
                    timeout: 10000
                }),
                timeout: 10000,
                validateStatus: status => status < 500,  // 4xx 에러도 처리
                maxContentLength: 5 * 1024 * 1024,      // 5MB
                transformResponse: [(data) => {
                    try {
                        return typeof data === 'string' ? JSON.parse(data) : data;
                    } catch {
                        return data;
                    }
                }]
            });
            this.axiosInstances.set(hostname, instance);
        }
        return this.axiosInstances.get(hostname);
    }

    async request(config: AxiosRequestConfig): Promise<any> {
        const startTime = Date.now();
        const url = new URL(config.url);
        const instance = this.getAxiosInstance(url.hostname);

        try {
            const response = await instance({
                ...config,
                headers: {
                    ...config.headers,
                    'Accept-Encoding': 'gzip',
                    'Connection': 'keep-alive'
                }
            });

            if (!response.data && response.status !== 204) {
                throw new Error('Empty response received');
            }

            console.log('Network metrics:', {
                time: Date.now() - startTime,
                host: url.hostname
            });

            return response;
        } catch (error) {
            const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
            throw new Error(isTimeout ? 'Request timeout' : error.message);
        }
    }
}