// =====================================================
// Centralized typed config (read from env via ConfigService)
// =====================================================
export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  databaseUrl: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  cookieNameRefreshToken: string;
  cookieSecure: boolean;
  corsOrigin: string[];
  throttleTtl: number; // seconds
  throttleLimit: number;
}

export const loadAppConfig = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3001,
  apiPrefix: process.env.API_PREFIX || '/api',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || '',
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  cookieNameRefreshToken: process.env.COOKIE_NAME_REFRESH_TOKEN || 'erp_rt',
  cookieSecure: (process.env.NODE_ENV || 'development') === 'production',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim()),
  throttleTtl: Number(process.env.THROTTLE_TTL) || 60,
  throttleLimit: Number(process.env.THROTTLE_LIMIT) || 10,
});
