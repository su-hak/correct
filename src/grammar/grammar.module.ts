import { Module } from '@nestjs/common';
/* import { GrammarController } from './grammar.controller'; */
import { GrammarService } from './grammar.service';
import { AuthModule } from 'src/auth/auth.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from 'src/shared/shared.module';
/* import { TypeOrmModule } from '@nestjs/typeorm';
import { GrammarLearning } from './entities/grammar-Learning.entity';
import { GrammarLearningService } from './grammar-Learning.service'; 
import { GrammarAdminController } from './grammarAdmin.controller';
import { GrammarSeedService } from './grammarSeed.service'; */

@Module({
  imports: [
    AuthModule,
    HttpModule,
    ConfigModule, // ConfigService를 사용하기 위해 필요
    SharedModule,
  ],
  controllers: [
  ],
  providers: [
    GrammarService, 
  ],
  exports: [
    GrammarService, 
  ]
})
export class GrammarModule {}