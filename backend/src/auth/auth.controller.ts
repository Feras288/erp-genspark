import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { setRefreshCookie, clearRefreshCookie } from '../common/cookies/cookie.util';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser, SafeUser } from '../common/types/auth.types';

function clientMeta(req: Request) {
  return {
    ip: (req.ip ?? req.headers['x-forwarded-for']?.toString()) || undefined,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? undefined,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieName() {
    return this.config.get<string>('COOKIE_NAME_REFRESH_TOKEN') || 'erp_rt';
  }
  private secureCookie() {
    return (this.config.get<string>('NODE_ENV') || 'development') === 'production';
  }

  @Post('login')
  @HttpCode(200)
  // Strict per-IP rate limit on login. TODO(phase1-b): per-email.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const out = await this.auth.login(dto.email, dto.password, clientMeta(req));
    setRefreshCookie(res, out.refreshToken, {
      secure: this.secureCookie(),
      maxAgeMs: out.refreshMaxAgeMs,
      name: this.cookieName(),
    });
    return out.response;
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Body() _dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const cookieName = this.cookieName();
    const raw = (req.cookies?.[cookieName] as string | undefined) ?? _dto?.refreshToken;
    const out = await this.auth.refresh(raw, clientMeta(req));
    setRefreshCookie(res, out.refreshToken, {
      secure: this.secureCookie(),
      maxAgeMs: out.refreshMaxAgeMs,
      name: cookieName,
    });
    return out.response;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[this.cookieName()] as string | undefined;
    await this.auth.logout(raw, clientMeta(req));
    clearRefreshCookie(res, this.cookieName(), this.secureCookie());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentUser() user: AuthenticatedUser): Promise<SafeUser> {
    return this.auth.me(user.id);
  }
}
