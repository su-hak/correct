import { Module } from '@nestjs/common';
import { ImageProcessingController } from './image-processing.controller';
import { VisionService } from './vision.service';
import { BullModule } from '@nestjs/bull';
import { GrammarService } from 'src/grammar/grammar.service';
import { GrammarModule } from 'src/grammar/grammar.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'image-processing',
    }),
    GrammarModule
  ],
  controllers: [ImageProcessingController],
  providers: [VisionService, GrammarService],
})
export class ImageProcessingModule {}