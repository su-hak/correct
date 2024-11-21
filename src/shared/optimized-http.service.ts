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
                   maxSockets: 50,
                   timeout: 30000
               }),
               timeout: 30000,
               maxContentLength: 10 * 1024 * 1024,
               validateStatus: status => status >= 200 && status < 300,
               transformResponse: [(data) => {
                   try {
                       return JSON.parse(data);
                   } catch (error) {
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
                   ...config.headers
               }
           });

           console.log('Network metrics:', {
               time: Date.now() - startTime,
               host: url.hostname
           });

           return response;
       } catch (error) {
           throw error;
       }
   }
}