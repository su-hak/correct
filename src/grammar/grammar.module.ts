// src/grammar/grammar.module.ts
import { Module } from '@nestjs/common';
import { GrammarController } from './grammar.controller';
import { GrammarService } from './grammar.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [GrammarController],
  providers: [GrammarService],
})
export class GrammarModule {}