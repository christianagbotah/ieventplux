import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';
import { loadEnv } from '@ieventplux/config';
import { AppModule } from './app.module.js';

export async function createApp() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true, bodyParser: false });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf; } }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.enableCors({ origin: [env.WEB_URL, env.MOBILE_URL].filter(Boolean) as string[], credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id'] });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  if (env.APP_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('iEventPlux API').setVersion('1').addCookieAuth('ieventplux_session').addBearerAuth().build());
    SwaggerModule.setup('api/v1/docs', app, doc);
  }
  return app;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createApp().then((app) => app.listen(Number(new URL(loadEnv().API_URL).port || 4000), '0.0.0.0')).then(() => console.log(`API listening on ${loadEnv().API_URL}/api/v1`));
}
