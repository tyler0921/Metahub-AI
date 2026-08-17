import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from './agents/agents.module';
import { configurations } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { LlmModule } from './llm/llm.module';
import { VaultModule } from './vault/vault.module';
import { WorkflowModule } from './workflow/workflow.module';
import { WorkspaceModule } from './workspace/workspace.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configurations,
      validate: validateEnv,
      envFilePath: ['.env', '../.env'],
    }),
    HealthModule,
    AgentsModule,
    LlmModule,
    VaultModule,
    WorkspaceModule,
    WorkflowModule,
  ],
})
export class AppModule {}
