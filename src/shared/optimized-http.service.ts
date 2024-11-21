import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosHeaders } from 'axios';
import * as https from 'https';

@Injectable()
export class OptimizedHttpService {
   private axiosInstances = new Map<string, AxiosInstance>();

   private getAxiosInstance(hostname: string): AxiosInstance {
       if (!this.axiosInstances.has(hostname)) {
           const instance = axios.create({
               httpsAgent: new https.Agent({
                   keepAlive: true,
                   maxSockets: 100,
                   keepAliveMsecs: 60000,
                   timeout: 5000,
                   scheduling: 'fifo'
               }),
               timeout: 5000,
               maxRedirects: 0,
               decompress: true,
               maxContentLength: 5 * 1024 * 1024,
               validateStatus: status => status >= 200 && status < 500
           });

           // 성능 최적화 인터셉터
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
           console.error('Request failed:', error.message);
           throw error;
       }
   }
}