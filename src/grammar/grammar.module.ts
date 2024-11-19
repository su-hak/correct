import { Module } from '@nestjs/common';
import { GrammarController } from './grammar.controller';
import { GrammarService } from './grammar.service';
import { AuthModule } from 'src/auth/auth.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
/* import { TypeOrmModule } from '@nestjs/typeorm';
import { GrammarLearning } from './entities/grammar-Learning.entity';
import { GrammarLearningService } from './grammar-Learning.service'; */
import { GrammarAdminController } from './grammarAdmin.controller';
import { GrammarSeedService } from './grammarSeed.service';

@Module({
  imports: [
    AuthModule,
    HttpModule,
    ConfigModule, // ConfigService를 사용하기 위해 필요
  ],
  controllers: [
    GrammarController,
    GrammarAdminController
  ],
  providers: [
    GrammarService, 
    GrammarSeedService
  ],
  exports: [
    GrammarService, 
    GrammarSeedService,
  ]
})
export class GrammarModule {}