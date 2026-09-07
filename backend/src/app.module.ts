// =====================================================
// ERP Backend — root module (Phase 1 wiring)
// =====================================================
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RbacModule } from './rbac/rbac.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'], cache: true }),
    ThrottlerModule.forRoot([
      // 'short' = per-endpoint overrides using @Throttle({ short: { limit, ttl } }).
      // 'default' = bucket targeted by @Throttle({ default: { ... } }) /
      //              @Throttle({ global: { ... } }) depending on syntax.
      // 'global' = absolute per-IP ceiling (60 req/min/IP).
      { name: 'default', ttl: 60_000, limit: 60 },
      { name: 'global', ttl: 60_000, limit: 60 },
    ]),
    DatabaseModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RbacModule,
  ],
  providers: [
    // Apply throttling globally. Auth endpoints will override with @Throttle.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
