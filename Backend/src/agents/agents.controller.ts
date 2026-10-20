import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Agent, AgentsResponse, AmbientChatResponse, AppConfigResponse } from '@shared';
import { AgentsService } from './agents.service';
import { AmbientChatService } from './ambient-chat.service';
import { AgentIdParamDto } from './dto/agent-id.param.dto';
import { AmbientChatDto } from './dto/ambient-chat.dto';
import type {
  AutonomousWorkConfig,
  VaultConfig,
  WorkflowConfig,
  SecurityConfig,
} from '../config/configuration';
import { LlmBudgetService } from '../llm/llm-budget.service';
import { LlmModelRegistry } from '../llm/llm-model.registry';

@Controller()
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly ambientChat: AmbientChatService,
    private readonly config: ConfigService,
    private readonly budget: LlmBudgetService,
    private readonly models: LlmModelRegistry,
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

  /** 오피스 휴게 중 두 직원의 AI 스몰토크 */
  @Post('agents/ambient-chat')
  generateAmbientChat(@Body() body: AmbientChatDto): Promise<AmbientChatResponse> {
    return this.ambientChat.generate(body.agentA, body.agentB);
  }

  /** 실행 환경 (API 키 같은 비밀값은 내보내지 않습니다) */
  @Get('config')
  getConfig(): AppConfigResponse {
    // 화면에서 모델을 바꿨을 수 있으므로 .env 가 아니라 지금 쓰는 값을 내보냅니다
    const llm = this.models.config;
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
