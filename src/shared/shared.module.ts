import { Module } from "@nestjs/common";
import { OptimizedHttpService } from "./optimized-http.service";

// src/shared/shared.module.ts
@Module({
    providers: [OptimizedHttpService],
    exports: [OptimizedHttpService]
  })
  export class SharedModule {}