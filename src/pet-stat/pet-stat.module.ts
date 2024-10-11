import { Module } from '@nestjs/common';
import { PetStatController } from './pet-stat.controller';
import { PetStatService } from './pet-stat.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  controllers: [PetStatController],
  providers: [PetStatService],
})
export class PetStatModule {}