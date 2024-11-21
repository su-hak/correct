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

    async requestWithRetry(config: AxiosRequestConfig): Promise<any> {
        const instances = Array(3).fill(null).map(() =>
            axios.create({
                timeout: 10000,
                httpsAgent: new https.Agent({
                    keepAlive: true,
                    maxSockets: 50,
                    rejectUnauthorized: false,
                    noDelay: true
                })
            })
        );

        const responses = await Promise.race(
            instances.map(instance => instance(config))
        );

        return responses;
    }
    createAxiosInstance(baseURL: string): AxiosInstance {
        const agent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 1000,
            maxSockets: 50,
            rejectUnauthorized: false,
            scheduling: 'lifo',
            noDelay: true
        });

        const instance = axios.create({
            baseURL,
            timeout: 10000,
            maxContentLength: 10 * 1024 * 1024,
            socketPath: null,
            httpAgent: new http.Agent({
                keepAlive: true,
                maxSockets: 50,
                maxFreeSockets: 10,
                timeout: 60000,
                scheduling: 'fifo'
            }),
            maxRedirects: 0,
            responseType: 'arraybuffer',
            headers: {
                'Connection': 'keep-alive',
                'Accept-Encoding': 'gzip,deflate'
            },
            transitional: {
                silentJSONParsing: true,
                forcedJSONParsing: true,
                clarifyTimeoutError: false
            }
        });

        // DNS 캐싱 인터셉터 추가
        instance.interceptors.request.use(async (config) => {
            const url = new URL(config.url);
            if (!this.dnsCache.has(url.hostname)) {
                const addresses = await dns.promises.resolve(url.hostname);
                this.dnsCache.set(url.hostname, addresses[0]);
            }
            return config;
        });

        return instance;
    }
}