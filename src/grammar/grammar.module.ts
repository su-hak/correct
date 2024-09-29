import { Module } from '@nestjs/common';
import { GrammarController } from './grammar.controller';
import { GrammarService } from './grammar.service';
import { AuthModule } from 'src/auth/auth.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    AuthModule,
    HttpModule,
  ],
  controllers: [GrammarController],
  providers: [GrammarService],
  exports: [GrammarService]
})
export class GrammarModule {}