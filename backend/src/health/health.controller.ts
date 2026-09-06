// =====================================================
// Health Check — /api/health
// Phase 0: app + db ping.
// In later phases we'll add: redis, storage, queue, etc.
// =====================================================
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaService } from '../database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // ping database via raw SQL — the cheapest reliable check
      async () => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return { database: { status: 'up' } };
        } catch (e) {
          return { database: { status: 'down', message: (e as Error).message } };
        }
      },
    ]);
  }
}
