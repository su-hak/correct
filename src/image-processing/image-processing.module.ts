import { Module } from '@nestjs/common';
import { ImageProcessingController } from './image-processing.controller';
import { VisionService } from './vision.service';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'image-processing',
    }),
  ],
  controllers: [ImageProcessingController],
  providers: [VisionService],
})
export class ImageProcessingModule {}