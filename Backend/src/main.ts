import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import type { AppConfig, LlmConfig, VaultConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const appCfg = config.getOrThrow<AppConfig>('app');
  const llmCfg = config.getOrThrow<LlmConfig>('llm');
  const vaultCfg = config.getOrThrow<VaultConfig>('vault');

  app.setGlobalPrefix('api');

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
  logger.log(`CORS       ${appCfg.corsOrigins.join(', ')}`);
}

void bootstrap();
