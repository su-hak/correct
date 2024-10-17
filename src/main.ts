import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  process.env.TZ = 'Asia/Seoul';
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use((req, res, next) => {
    req.setTimeout(300000, () => {
      res.status(408).send('Request Timeout');
    });
    next();
  });

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Community API')
    .setDescription('The community API description')
    .setVersion('1.0')
    .addTag('grammeter')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  app.use((req, res, next) => {
    req.setTimeout(120000); // 2분으로 조정
    res.setTimeout(120000); // 2분으로 조정
    next();
  });

  const port = process.env.PORT || configService.get('PORT') || 3000;
  const server = await app.listen(port);
  server.setTimeout(300000);

  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    logger.log(`Memory usage: ${JSON.stringify(memoryUsage)}`);
  }, 60000);

  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`Node environment: ${process.env.NODE_ENV}`);
  console.log(`Memory usage: ${JSON.stringify(process.memoryUsage())}`);
}
bootstrap();
