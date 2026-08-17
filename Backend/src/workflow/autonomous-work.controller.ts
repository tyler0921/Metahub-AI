import { Controller, Get, Post } from '@nestjs/common';
import type { AutonomousWorkStatusResponse } from '@shared';
import { AutonomousWorkService } from './autonomous-work.service';

@Controller('autonomous-work')
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
