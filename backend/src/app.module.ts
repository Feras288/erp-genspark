// =====================================================
// ERP Backend — root module
// Phase 0 wiring: Config + Prisma + Health check only.
// Business modules are added in later phases.
// =====================================================
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      cache: true,
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
