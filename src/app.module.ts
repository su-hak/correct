import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { GrammarModule } from './grammar/grammar.module';
import { AuthModule } from './auth/auth.module';
import { BullModule } from '@nestjs/bull';
import { ImageProcessingModule } from './image-processing/image-processing.module';
import { CacheModule } from '@nestjs/cache-manager';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Railway 환경변수 사용
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          type: 'mysql',  // Railway는 MySQL 사용
          host: process.env.MYSQLHOST,
          port: parseInt(process.env.MYSQLPORT),
          username: process.env.MYSQLUSER,
          password: process.env.MYSQLPASSWORD,
          database: process.env.MYSQLDATABASE,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          logging: true,
          logger: 'advanced-console',
          ssl: {
            rejectUnauthorized: false
          },
          pool: {
            min: 0,
            max: 10,
            idle: 10000,
            acquire: 30000
          }
        };
      },
      inject: [ConfigService],
    }),
    SharedModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get('REDIS_URL');
        if (redisUrl) {
          return {
            redis: redisUrl,
          };
        } else {
          return {
            redis: {
              host: configService.get('REDIS_HOST'),
              port: configService.get('REDIS_PORT'),
            },
          };
        }
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'image-processing',
    }),
    UsersModule,
    GrammarModule,
    AuthModule,
    ImageProcessingModule,
    CacheModule.register({
      isGlobal: true,
    }),
  ],
})
export class AppModule { }