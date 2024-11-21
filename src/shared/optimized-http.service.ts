import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosHeaders } from 'axios';
import * as dns from 'dns';
import * as https from 'https';
import * as http from 'http';
import * as http2 from 'http2';
import { OutgoingHttpHeaders } from 'http2';

@Injectable()
export class OptimizedHttpService {
    private dnsCache = new Map();
    private http2Clients = new Map();
    
    private keepAliveAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 50,
        timeout: 60000,
        scheduling: 'lifo',
        noDelay: true,
        rejectUnauthorized: true, // 프로덕션 환경 설정
        secureProtocol: 'TLSv1_2_method'
    });

    constructor() {
        process.on('exit', () => {
            for (const client of this.http2Clients.values()) {
                client.close();
            }
        });
    }

    private async getHttp2Client(hostname: string): Promise<http2.ClientHttp2Session> {
        if (!this.http2Clients.has(hostname)) {
            const client = await http2.connect(`https://${hostname}`, {
                settings: {
                    enablePush: false,
                    initialWindowSize: 1024 * 1024,
                    maxConcurrentStreams: 100
                }
            });

            client.on('error', (err) => {
                console.error(`HTTP/2 client error for ${hostname}:`, err);
                this.http2Clients.delete(hostname);
            });

            client.on('goaway', () => {
                this.http2Clients.delete(hostname);
            });

            this.http2Clients.set(hostname, client);
        }
        return this.http2Clients.get(hostname);
    }

    async requestWithRetry(config: AxiosRequestConfig, retries = 3): Promise<any> {
        const startTime = Date.now();
        const url = new URL(config.url);

        if (!this.dnsCache.has(url.hostname)) {
            try {
                const addresses = await dns.promises.resolve4(url.hostname);
                this.dnsCache.set(url.hostname, addresses[0]);
            } catch (error) {
                console.error(`DNS resolution failed for ${url.hostname}:`, error);
            }
        }

        const optimizedConfig: AxiosRequestConfig = {
            ...config,
            httpsAgent: this.keepAliveAgent,
            headers: {
                ...config.headers,
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Host': url.hostname
            },
            decompress: true,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024,
            timeout: 30000,
            validateStatus: (status) => status < 500,
            onUploadProgress: (e) => {
                if (e.total) {
                    const speed = (e.loaded / (Date.now() - startTime)) * 1000;
                    console.log(`Upload speed: ${(speed / 1024).toFixed(1)} KB/s`);
                }
            },
            onDownloadProgress: (e) => {
                if (e.total) {
                    const speed = (e.loaded / (Date.now() - startTime)) * 1000;
                    console.log(`Download speed: ${(speed / 1024).toFixed(1)} KB/s`);
                }
            }
        };

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const response = await axios(optimizedConfig);
                
                console.log('Network metrics:', {
                    time: Date.now() - startTime,
                    host: url.hostname,
                    cached: this.dnsCache.has(url.hostname),
                    attempt: attempt + 1,
                    status: response.status
                });

                return response;
            } catch (error) {
                if (attempt === retries - 1) throw error;

                console.error(`Request failed (attempt ${attempt + 1}/${retries}):`, error.message);
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
    }

    async http2Request(config: AxiosRequestConfig): Promise<any> {
        const url = new URL(config.url);
        const client = await this.getHttp2Client(url.hostname);

        return new Promise((resolve, reject) => {
            // HTTP/2 헤더 타입 처리
            const headers: OutgoingHttpHeaders = {
                ':method': config.method?.toUpperCase() || 'GET',
                ':path': url.pathname + url.search
            };

            // 추가 헤더가 있다면 HTTP/2 호환 형식으로 변환
            if (config.headers) {
                Object.entries(config.headers).forEach(([key, value]) => {
                    if (value !== undefined) {
                        headers[key.toLowerCase()] = value;
                    }
                });
            }

            const stream = client.request(headers);

            let data = '';
            stream.on('data', (chunk) => data += chunk);
            stream.on('end', () => resolve(data));
            stream.on('error', reject);

            if (config.data) {
                stream.write(config.data);
            }
            stream.end();
        });
    }
}