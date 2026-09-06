// =====================================================
// ERP Backend — bootstrap entry
// Phase 0: secure-by-default (helmet, CORS, validation, /api prefix)
// =====================================================
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Security headers
  app.use(helmet());

  // CORS — restrict to configured origin(s)
  const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim());
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Global validation (whitelist strips unknown fields, forbidNonWhitelisted throws on unknown)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // API prefix
  const apiPrefix = process.env.API_PREFIX || '/api';
  app.setGlobalPrefix(apiPrefix.replace(/^\//, ''));

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ERP API')
    .setDescription('Saudi-market ERP backend — Phase 0')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `🚀 ERP backend listening on http://localhost:${port}${apiPrefix} (docs at ${apiPrefix}/docs)`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
