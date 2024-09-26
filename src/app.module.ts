import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import * as path from 'path';
import { GrammarModule } from './grammar/grammar.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? undefined : path.resolve(__dirname, '..', '.env'),
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
    UsersModule,
    GrammarModule,
    AuthModule
  ],
})
export class AppModule {}