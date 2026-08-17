import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { LlmModule } from '../llm/llm.module';
import { VaultModule } from '../vault/vault.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { BuildPhase } from './phases/build.phase';
import { DraftPhase } from './phases/draft.phase';
import { FeedbackPhase } from './phases/feedback.phase';
import { IntegratePhase } from './phases/integrate.phase';
import { KickoffPhase } from './phases/kickoff.phase';
import { ReviewPhase } from './phases/review.phase';
import { RevisePhase } from './phases/revise.phase';
import { SessionRepository } from './repositories/session.repository';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { AutonomousWorkService } from './autonomous-work.service';

@Module({
  imports: [AgentsModule, LlmModule, VaultModule, WorkspaceModule],
  controllers: [WorkflowController],
  providers: [
    SessionRepository,
    WorkflowService,
    AutonomousWorkService,
    KickoffPhase,
    DraftPhase,
    FeedbackPhase,
    RevisePhase,
    IntegratePhase,
    BuildPhase,
    ReviewPhase,
  ],
})
export class WorkflowModule {}
