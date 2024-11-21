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
                    maxSockets: 10,
                    timeout: 10000
                }),
                timeout: 10000,
                validateStatus: (status) => true,  // 모든 상태 코드 허용
                maxContentLength: 5 * 1024 * 1024,
                transformResponse: [(data) => {
                    if (!data) return { success: false };
                    try {
                        return typeof data === 'string' ? JSON.parse(data) : data;
                    } catch {
                        return { success: false, data };
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
                    'Accept-Encoding': 'gzip'
                }
            });

            console.log('Network metrics:', {
                time: Date.now() - startTime,
                host: url.hostname
            });

            return {
                ...response,
                success: true,
                data: response.data || { message: 'No data' }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }
}