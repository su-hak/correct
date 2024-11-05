import { Module } from '@nestjs/common';
import { GrammarController } from './grammar.controller';
import { GrammarService } from './grammar.service';
import { AuthModule } from 'src/auth/auth.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrammarLearning } from './entities/grammar-Learning.entity';
import { GrammarLearningService } from './grammar-Learning.service';

@Module({
  imports: [
    AuthModule,
    HttpModule,
    ConfigModule, // ConfigService를 사용하기 위해 필요
    TypeOrmModule.forFeature([GrammarLearning])
  ],
  controllers: [GrammarController],
  providers: [GrammarService, GrammarLearningService],
  exports: [GrammarService, GrammarLearningService]
})
export class GrammarModule {}