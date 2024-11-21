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
                    maxFreeSockets: 10,
                    timeout: 10000,
                    scheduling: 'fifo'
                }),
                maxRedirects: 5,
                timeout: 10000,
                decompress: true,
                maxContentLength: 1024 * 1024, // 1MB
                maxBodyLength: 1024 * 1024,    // 1MB
                headers: {
                    'Accept-Encoding': 'gzip',
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
        const instance = this.getAxiosInstance(url.hostname);

        try {
            const response = await instance({
                ...config,
                headers: {
                    ...config.headers,
                    'Content-Length': config.data ? Buffer.byteLength(JSON.stringify(config.data)) : 0
                },
                transformResponse: [
                    (data) => {
                        try {
                            return JSON.parse(data);
                        } catch {
                            return data;
                        }
                    }
                ],
                responseType: 'json'
            });

            const endTime = Date.now();
            console.log('Network metrics:', {
                time: endTime - startTime,
                host: url.hostname
            });

            return response;
        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }
}