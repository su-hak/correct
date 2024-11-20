// shared/optimized-http.service.ts
import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import dns from 'dns';
import https from 'https';

@Injectable()
export class OptimizedHttpService {
    private dnsCache = new Map();
    private agent = new https.Agent({
        keepAlive: true,
        maxSockets: 100,
        keepAliveMsecs: 10000
    });

    // shared/optimized-http.service.ts
    createAxiosInstance(baseURL: string): AxiosInstance {
        dns.setDefaultResultOrder('ipv4first');

        const axiosInstance = axios.create({
            baseURL,
            timeout: 10000,
            httpAgent: this.agent,
            httpsAgent: this.agent,
            headers: {
                'Connection': 'keep-alive'
            }
        });

        // axios interceptor로 변경
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