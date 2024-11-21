import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as https from 'https';

@Injectable()
export class OptimizedHttpService {
   private axiosInstances = new Map<string, AxiosInstance>();

   private getAxiosInstance(hostname: string): AxiosInstance {
       if (!this.axiosInstances.has(hostname)) {
           const instance = axios.create({
               httpsAgent: new https.Agent({
                   keepAlive: true,
                   maxSockets: 50,
                   timeout: 30000,
                   scheduling: 'lifo'
               }),
               timeout: 30000,
               decompress: true,
               maxContentLength: 10 * 1024 * 1024,
               headers: {
                   'Accept-Encoding': 'gzip',
                   'Connection': 'keep-alive'
               },
               validateStatus: (status) => status < 500
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
                   ...config.headers
               }
           });

           console.log('Network metrics:', {
               time: Date.now() - startTime,
               host: url.hostname
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