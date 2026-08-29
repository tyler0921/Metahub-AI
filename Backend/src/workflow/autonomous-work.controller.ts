import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type {
  AutonomousApprovalItem,
  AutonomousBacklogItem,
  AutonomousInboxResponse,
  AutonomousWorkStatusResponse,
} from '@shared';
import { AutonomousWorkService } from './autonomous-work.service';
import { AdminMutationGuard } from '../common/guards/admin-mutation.guard';
import { AutonomousInboxStore } from './autonomous-inbox.store';
import { CreateBacklogDto } from './dto/create-backlog.dto';
import { ApprovalDecisionDto } from './dto/approval-decision.dto';
import { SessionIdParamDto } from './dto/session-id.param.dto';

@Controller('autonomous-work')
@UseGuards(AdminMutationGuard)
export class AutonomousWorkController {
  constructor(
    private readonly autonomousWork: AutonomousWorkService,
    private readonly inbox: AutonomousInboxStore,
  ) {}

  @Get('status')
  status(): AutonomousWorkStatusResponse {
    return this.autonomousWork.getStatus();
  }

  @Post('pause')
  pause(): AutonomousWorkStatusResponse {
    return this.autonomousWork.pause();
  }

  @Post('resume')
  resume(): AutonomousWorkStatusResponse {
    return this.autonomousWork.resume();
  }

  @Post('run-now')
  runNow(): AutonomousWorkStatusResponse {
    return this.autonomousWork.runNow();
  }

  @Get('inbox')
  getInbox(): AutonomousInboxResponse {
    return this.inbox.snapshot();
  }

  @Post('backlog')
  createBacklog(@Body() dto: CreateBacklogDto): AutonomousBacklogItem {
    return this.inbox.enqueue(dto.brief.trim(), dto.priority ?? 3);
  }

  @Post('backlog/:id/cancel')
  cancelBacklog(@Param() params: SessionIdParamDto): AutonomousBacklogItem {
    return this.inbox.cancel(params.id);
  }

  @Post('approvals/:id/approve')
  approve(
    @Param() params: SessionIdParamDto,
    @Body() dto: ApprovalDecisionDto,
  ): AutonomousApprovalItem {
    return this.inbox.decide(params.id, true, dto.note);
  }

  @Post('approvals/:id/reject')
  reject(
    @Param() params: SessionIdParamDto,
    @Body() dto: ApprovalDecisionDto,
  ): AutonomousApprovalItem {
    return this.inbox.decide(params.id, false, dto.note);
  }
}
