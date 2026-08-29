import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import type {
  AppConfig,
  LlmConfig,
  VaultConfig,
  WorkspaceConfig,
} from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const appCfg = config.getOrThrow<AppConfig>('app');
  const llmCfg = config.getOrThrow<LlmConfig>('llm');
  const vaultCfg = config.getOrThrow<VaultConfig>('vault');
  const workspaceCfg = config.getOrThrow<WorkspaceConfig>('workspace');

  app.setGlobalPrefix('api');

  /**
   * 코드형 산출물 정적 서빙.
   *
   * `/api` 접두사 **밖**에 둡니다. 만들어진 랜딩페이지가 `style.css` 처럼
   * 상대 경로로 서로를 참조하므로, 실제 웹서버와 같은 모양이어야
   * iframe 안에서 그대로 동작합니다.
   */
  app.useStaticAssets(workspaceCfg.path, {
    prefix: workspaceCfg.urlPrefix,
    // AI 가 방금 고쳐 쓴 파일이 캐시 때문에 옛날 것으로 보이면 안 됩니다
    etag: false,
    maxAge: 0,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  });

  app.enableCors({
    origin: appCfg.corsOrigins.includes('*') ? true : appCfg.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.enableShutdownHooks();

  await app.listen(appCfg.port);

  const logger = new Logger('Bootstrap');
  logger.log(`API        http://localhost:${appCfg.port}/api`);
  logger.log(
    llmCfg.provider === 'mock'
      ? 'LLM        mock — API 키가 없어 가짜 응답으로 동작합니다'
      : `LLM        ${llmCfg.provider} (${llmCfg.model}) · 동시 ${llmCfg.maxConcurrent}건 · 분당 ${llmCfg.requestsPerMinute || '무제한'}`,
  );
  if (llmCfg.provider === 'mock') {
    logger.log('           무료 키 발급 → https://aistudio.google.com/apikey');
  }
  logger.log(`Obsidian   ${vaultCfg.path}`);
  logger.log(`Workspace  ${workspaceCfg.path}  →  ${workspaceCfg.urlPrefix}/`);
  logger.log(`CORS       ${appCfg.corsOrigins.join(', ')}`);
}

void bootstrap();
