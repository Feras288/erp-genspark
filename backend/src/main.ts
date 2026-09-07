// =====================================================
// ERP Backend — bootstrap entry (Phase 1).
// helmet + CORS(credentials) + cookie-parser + ValidationPipe + Swagger + /api prefix
// =====================================================
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(helmet());
  app.use(cookieParser());

  const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // NOTE: JwtAuthGuard + PermissionsGuard are NOT global — they opt-in
  // per @UseGuards on controllers (see Users/Rbac controllers). Keeping them
  // global would block /login, /refresh, /health, /api/docs, etc.

  const apiPrefix = process.env.API_PREFIX || '/api';
  app.setGlobalPrefix(apiPrefix.replace(/^\//, ''));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ERP API')
    .setDescription('Saudi-market ERP backend (Phase 1: Auth + RBAC)')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `🚀 ERP backend http://localhost:${port}${apiPrefix}  (docs: ${apiPrefix}/docs, env=${process.env.NODE_ENV})`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
