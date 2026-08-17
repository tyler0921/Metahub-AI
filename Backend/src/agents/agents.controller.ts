import { Controller, Get, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Agent, AgentsResponse, AppConfigResponse } from '@shared';
import { AgentsService } from './agents.service';
import { AgentIdParamDto } from './dto/agent-id.param.dto';
import type {
  AutonomousWorkConfig,
  LlmConfig,
  VaultConfig,
  WorkflowConfig,
  SecurityConfig,
} from '../config/configuration';
import { LlmBudgetService } from '../llm/llm-budget.service';

@Controller()
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly config: ConfigService,
    private readonly budget: LlmBudgetService,
  ) {}

  /** 직원 명단 + 오피스 맵 */
  @Get('agents')
  findAll(): AgentsResponse {
    return {
      agents: this.agents.findAll().map((a) => a.toPublic()),
      office: this.agents.getOffice().toPublic(),
    };
  }

  @Get('agents/:id')
  findOne(@Param() params: AgentIdParamDto): Agent {
    return this.agents.findById(params.id).toPublic();
  }

  /** 실행 환경 (API 키 같은 비밀값은 내보내지 않습니다) */
  @Get('config')
  getConfig(): AppConfigResponse {
    const llm = this.config.getOrThrow<LlmConfig>('llm');
    const vault = this.config.getOrThrow<VaultConfig>('vault');
    const workflow = this.config.getOrThrow<WorkflowConfig>('workflow');
    const autonomousWork = this.config.getOrThrow<AutonomousWorkConfig>('autonomousWork');
    const security = this.config.getOrThrow<SecurityConfig>('security');
    const budget = this.budget.snapshot();

    return {
      provider: llm.provider,
      model: llm.model,
      vaultPath: vault.path,
      vaultRoot: vault.rootFolder,
      feedbackRounds: workflow.feedbackRounds,
      maxRework: workflow.maxRework,
      adminAuthRequired: security.adminToken.length > 0,
      llmBudget: {
        calls: budget.calls,
        inputTokens: budget.inputTokens,
        outputTokens: budget.outputTokens,
        dailyCallLimit: budget.dailyCallLimit,
        dailyTokenLimit: budget.dailyTokenLimit,
      },
      autonomousWork: {
        enabled: autonomousWork.enabled,
        intervalMinutes: Math.round(autonomousWork.intervalMs / 60_000),
        dailyLimit: autonomousWork.dailyLimit,
      },
    };
  }
}
