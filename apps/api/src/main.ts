import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
if (existsSync('.env')) loadEnvFile('.env');
import { NestFactory } from '@nestjs/core';
import { AppModule } from './module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true,
    exceptionFactory: (errors) => new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ') || '参数不正确') }));
  await app.listen(Number(process.env.PORT ?? 3200), '0.0.0.0');
  console.log(`StudyDocs API: http://localhost:${process.env.PORT ?? 3200}/api`);
}
bootstrap().catch((error) => { console.error(error); process.exit(1); });
