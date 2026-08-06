import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@shared';
import type { AppConfig } from '../config/configuration';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      version: this.config.getOrThrow<AppConfig>('app').version,
    };
  }
}
