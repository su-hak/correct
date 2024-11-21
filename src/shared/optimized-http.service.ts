import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosHeaders } from 'axios';
import * as https from 'https';
import * as zlib from 'zlib';

@Injectable()
export class OptimizedHttpService {
    private axiosInstances = new Map<string, AxiosInstance>();

    private getAxiosInstance(hostname: string): AxiosInstance {
        if (!this.axiosInstances.has(hostname)) {
            const instance = axios.create({
                httpsAgent: new https.Agent({
                    keepAlive: true,
                    maxSockets: 100,
                    keepAliveMsecs: 30000,
                    timeout: 5000,
                    scheduling: 'fifo'
                }),
                timeout: 5000,
                maxRedirects: 0,
                maxBodyLength: 50 * 1024 * 1024,
                maxContentLength: 50 * 1024 * 1024,
                validateStatus: status => status >= 200 && status < 500,
                transformRequest: [(data, headers) => {
                    if (!data) return data;
                    
                    const compressed = zlib.gzipSync(JSON.stringify(data));
                    headers['Content-Encoding'] = 'gzip';
                    headers['Content-Length'] = compressed.length;
                    return compressed;
                }]
            });

            instance.interceptors.request.use(config => {
                const headers = new AxiosHeaders(config.headers);
                headers.set('Connection', 'keep-alive');
                headers.set('Accept-Encoding', 'gzip');
                config.headers = headers;
                return config;
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
            const response = await instance(config);
            console.log('Network metrics:', {
                time: Date.now() - startTime,
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