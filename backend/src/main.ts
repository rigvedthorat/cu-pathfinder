import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, //strip unknown properties
      forbidNonWhitelisted: true, //400 if the request has extra fields
      transform: true, //convert plain JSON -> DTO instance (runs class-transformer)
    }),
  );

  const allowedOrigins = (config.get<string>('CORS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (allowedOrigins.length === 0) {
    logger.warn(
      'CORS_ALLOWED_ORIGINS is empty - no cross-origin requests will be allowed.',
    );
  } else {
    logger.log(`CORS allow-list: ${allowedOrigins.join(', ')}`);
  }

  app.enableCors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: false,
  maxAge: 600,
  });

  await app.listen(config.get<number>('PORT') ?? 3000);
}
void bootstrap();