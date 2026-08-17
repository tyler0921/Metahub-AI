import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { SecurityConfig } from '../../config/configuration';

@Injectable()
export class AdminMutationGuard implements CanActivate {
  private readonly token: string;

  constructor(config: ConfigService) {
    this.token = config.getOrThrow<SecurityConfig>('security').adminToken;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === 'GET' || !this.token) return true;

    const authorization = request.header('authorization');
    const supplied = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : request.header('x-admin-token')?.trim();
    if (!supplied || !this.matches(supplied)) {
      throw new UnauthorizedException('관리자 토큰이 필요합니다.');
    }
    return true;
  }

  private matches(supplied: string): boolean {
    const expectedBytes = Buffer.from(this.token);
    const suppliedBytes = Buffer.from(supplied);
    return (
      expectedBytes.length === suppliedBytes.length &&
      timingSafeEqual(expectedBytes, suppliedBytes)
    );
  }
}
