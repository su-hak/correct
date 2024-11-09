import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import * as path from 'path';
import { GrammarModule } from './grammar/grammar.module';
import { AuthModule } from './auth/auth.module';
import { generateSecret } from './utils/secret-generator';
import { BullModule } from '@nestjs/bull';
import { ImageProcessingModule } from './image-processing/image-processing.module';
import { CacheModule } from '@nestjs/cache-manager';
import { CreateGrammarLearning1699262400000 } from './migrations/1699262400000-CreateGrammarLearning';
import { CreateGrammarLearning1699353600000 } from './migrations/1699353600000-CreateGrammarLearning';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? undefined : path.resolve(__dirname, '..', '.env'),
      load: [() => ({
        JWT_SECRET: process.env.JWT_SECRET || generateSecret(),
      })],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {

        const redisUrl = configService.get('REDIS_URL');
        const redisConfig = redisUrl ? new URL(redisUrl) : null;

        if (process.env.JAWSDB_MARIA_URL) {
          const matches = process.env.JAWSDB_MARIA_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
          return {
            type: 'mariadb',
            host: matches[3],
            port: parseInt(matches[4]),
            username: matches[1],
            password: matches[2],
            database: matches[5],
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            synchronize: false,
            logging: true,
            logger: 'advanced-console'
          };
        } else {
          return {
            type: 'mariadb',
            host: configService.get('DB_HOST'),
            port: +configService.get('DB_PORT'),
            username: configService.get('DB_USERNAME'),
            password: configService.get('DB_PASSWORD'),
            database: configService.get('DB_NAME'),
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            migrations: [CreateGrammarLearning1699353600000],
            migrationsRun: false, // 앱 시작 시 자동으로 마이그레이션 실행
            ssl: {
              rejectUnauthorized: false
            },
            synchronize: configService.get('DB_SYNC') === 'true',
            logging: true,
            logger: 'advanced-console',
            // MariaDB 전용 pool 설정
            pool: {
              min: 0,      // 최소 연결 수
              max: 10,     // 최대 연결 수
              idle: 10000, // 유휴 연결 타임아웃 (ms)
              acquire: 30000 // 연결 획득 타임아웃 (ms)
            },
            cache: redisConfig ? {
              type: "redis",
              options: {
                url: redisUrl
              },
              duration: 60000 // 1분
            } : false
          };
        }
      },
      inject: [ConfigService],
    }),
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