import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AutonomousWorkStatusResponse } from '@shared';
import { AutonomousWorkService } from './autonomous-work.service';
import { AdminMutationGuard } from '../common/guards/admin-mutation.guard';

@Controller('autonomous-work')
@UseGuards(AdminMutationGuard)
export class AutonomousWorkController {
  constructor(private readonly autonomousWork: AutonomousWorkService) {}

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
}
