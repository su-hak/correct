import { Module } from '@nestjs/common';
import { ImageProcessingController } from './image-processing.controller';
import { VisionService } from './vision.service';
import { BullModule } from '@nestjs/bull';
import { GrammarService } from 'src/grammar/grammar.service';
import { GrammarModule } from 'src/grammar/grammar.module';
import { ImageProcessingProcessor } from './image-processing.processor';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'image-processing',
    }),
    GrammarModule,
    HttpModule,
    ConfigModule
  ],
  controllers: [ImageProcessingController],
  providers: [VisionService, GrammarService, ImageProcessingProcessor],
  exports: [VisionService]
})
export class ImageProcessingModule {}