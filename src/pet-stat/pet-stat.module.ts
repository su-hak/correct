import { Module } from '@nestjs/common';
import { PetStatController } from './pet-stat.controller';
import { PetStatService } from './pet-stat.service';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
  ],
  controllers: [PetStatController],
  providers: [PetStatService],
})
export class PetStatModule {}