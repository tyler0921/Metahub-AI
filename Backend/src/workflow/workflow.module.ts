import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { LlmModule } from '../llm/llm.module';
import { VaultModule } from '../vault/vault.module';
import { DraftPhase } from './phases/draft.phase';
import { FeedbackPhase } from './phases/feedback.phase';
import { IntegratePhase } from './phases/integrate.phase';
import { KickoffPhase } from './phases/kickoff.phase';
import { ReviewPhase } from './phases/review.phase';
import { RevisePhase } from './phases/revise.phase';
import { SessionRepository } from './repositories/session.repository';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';

@Module({
  imports: [AgentsModule, LlmModule, VaultModule],
  controllers: [WorkflowController],
  providers: [
    SessionRepository,
    WorkflowService,
    KickoffPhase,
    DraftPhase,
    FeedbackPhase,
    RevisePhase,
    IntegratePhase,
    ReviewPhase,
  ],
})
export class WorkflowModule {}
