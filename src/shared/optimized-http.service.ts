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
       const startTime = Date.now();
       const response = await axios({
           ...config,
           onUploadProgress: (e) => console.log(`Upload speed: ${e.loaded / (Date.now() - startTime)} KB/s`),
           onDownloadProgress: (e) => console.log(`Download speed: ${e.loaded / (Date.now() - startTime)} KB/s`)
       });
       return response;
   }
}