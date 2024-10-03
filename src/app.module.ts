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
            synchronize: configService.get('DB_SYNC') === 'true',
            logging: true,
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
    })
  ],
})
export class AppModule {}