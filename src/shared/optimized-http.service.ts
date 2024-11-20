// optimized-http.service.ts
import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as dns from 'dns';
import * as https from 'https';
import * as zlib from 'zlib';

@Injectable()
export class OptimizedHttpService {
 private dnsCache = new Map();

 createAxiosInstance(baseURL: string, config?: AxiosRequestConfig): AxiosInstance {
   const agent = new https.Agent({
     keepAlive: true,
     keepAliveMsecs: 10000,
     maxSockets: 100,
     rejectUnauthorized: false
   });

   const instance = axios.create({
     baseURL,
     timeout: 10000,
     httpsAgent: agent,
     ...config,
     headers: {
       'Connection': 'keep-alive',
       'Accept-Encoding': 'gzip,deflate'
     },
     decompress: true,
     maxContentLength: 10 * 1024 * 1024 // 10MB
   });

   // DNS 캐싱
   instance.interceptors.request.use(async (config) => {
     const url = new URL(config.url);
     if (!this.dnsCache.has(url.hostname)) {
       const addresses = await dns.promises.resolve(url.hostname);
       this.dnsCache.set(url.hostname, addresses[0]);
     }
     return config;
   });

   // 응답 압축
   instance.interceptors.response.use((response) => {
     const contentEncoding = response.headers['content-encoding'];
     if (contentEncoding === 'gzip') {
       response.data = zlib.gunzipSync(response.data);
     } else if (contentEncoding === 'deflate') {
       response.data = zlib.inflateSync(response.data);
     }
     return response;
   });

   return instance;
 }
}