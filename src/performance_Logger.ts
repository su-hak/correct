import { Logger } from "@nestjs/common";

export class PerformanceLogger {
    private static timers = new Map<string, number>();
  
    static start(label: string) {
      this.timers.set(label, performance.now());
    }
  
    static end(label: string, logger: Logger) {
      const startTime = this.timers.get(label);
      if (startTime) {
        const duration = performance.now() - startTime;
        logger.log(`${label} took ${duration.toFixed(2)}ms`);
        this.timers.delete(label);
        return duration;
      }
      return 0;
    }
  }