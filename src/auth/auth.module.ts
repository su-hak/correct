// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { AuthController } from '../auth/auth.controller';
import { UsersModule } from '../users/users.module';

@Module({
    imports: [UsersModule],
    providers: [AuthService],
    controllers: [AuthController],
    exports: [AuthService],
  })
  export class AuthModule {}