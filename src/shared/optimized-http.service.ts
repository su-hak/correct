import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosHeaders } from 'axios';
import * as https from 'https';
import * as dns from 'dns';
import { promisify } from 'util';

@Injectable()
export class OptimizedHttpService {
   private axiosInstances = new Map<string, AxiosInstance>();
   private dnsLookup = promisify(dns.lookup);

   private async getAxiosInstance(hostname: string): Promise<AxiosInstance> {
       if (!this.axiosInstances.has(hostname)) {
           const instance = axios.create({
               httpsAgent: new https.Agent({
                   keepAlive: true,
                   maxSockets: 50,
                   maxFreeSockets: 20,
                   timeout: 8000,
                   scheduling: 'lifo',
               }),
               timeout: 8000,
               maxContentLength: 2 * 1024 * 1024,
               decompress: false,
               headers: new AxiosHeaders({
                   'Keep-Alive': 'timeout=5, max=1000'
               })
           });

           instance.interceptors.request.use(async config => {
               try {
                   const { address } = await this.dnsLookup(hostname, { family: 4 });
                   const headers = new AxiosHeaders(config.headers);
                   headers.set('Host', hostname);
                   config.headers = headers;
                   config.url = config.url.replace(hostname, address);
               } catch (error) {
                   console.error('DNS lookup failed:', error);
               }
               return config;
           });

           instance.interceptors.response.use(
               response => response,
               async error => {
                   if (error.code === 'ECONNABORTED') {
                       return Promise.reject(new Error('Request timeout'));
                   }
                   return Promise.reject(error);
               }
           );

           this.axiosInstances.set(hostname, instance);
       }
       return this.axiosInstances.get(hostname);
   }

   async request(config: AxiosRequestConfig): Promise<any> {
       const startTime = Date.now();
       const url = new URL(config.url);
       const instance = await this.getAxiosInstance(url.hostname);

       try {
           const headers = new AxiosHeaders(config.headers);
           headers.set('Accept-Encoding', 'gzip');
           headers.set('Connection', 'keep-alive');

           const response = await instance({
               ...config,
               headers
           });

           console.log('Network metrics:', {
               time: Date.now() - startTime,
               host: url.hostname
           });

           return {
               success: true,
               data: response.data,
               status: response.status
           };
       } catch (error) {
           return {
               success: false,
               error: error.message,
               status: error.response?.status
           };
       }
   }
}