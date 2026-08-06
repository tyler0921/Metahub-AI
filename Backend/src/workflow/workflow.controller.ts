import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Sse } from '@nestjs/common';
import type {
  CreateSessionResponse,
  SessionDetailResponse,
  SessionEvent,
  SessionSummary,
} from '@shared';
import { map, type Observable } from 'rxjs';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionIdParamDto } from './dto/session-id.param.dto';
import { SessionRepository } from './repositories/session.repository';
import { WorkflowService } from './workflow.service';

/** Nest 의 @Sse() 가 요구하는 봉투 형식 */
interface SseEnvelope {
  data: SessionEvent;
}

@Controller('sessions')
export class WorkflowController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly sessions: SessionRepository,
  ) {}

  /**
   * 대표 지시를 접수한다. 실제 작업은 백그라운드로 돌고 즉시 응답합니다.
   * 진행 상황은 응답의 `streamUrl` 을 EventSource 로 구독해서 받습니다.
   */
  @Post()
  create(@Body() dto: CreateSessionDto): CreateSessionResponse {
    const session = this.workflow.createSession(dto.brief, dto.parentSessionId);
    return {
      session: session.toSummary(),
      streamUrl: `/api/sessions/${session.id}/events`,
    };
  }

  /**
   * 진행 중인 세션을 중단한다.
   * 이미 끝났거나 실패한 세션에 호출해도 안전합니다 (아무 일도 하지 않음).
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param() params: SessionIdParamDto): SessionDetailResponse {
    const session = this.workflow.cancelSession(params.id);
    return { session: session.toSummary(), result: session.result };
  }

  @Get()
  findRecent(): SessionSummary[] {
    return this.sessions.findRecent().map((s) => s.toSummary());
  }

  @Get(':id')
  findOne(@Param() params: SessionIdParamDto): SessionDetailResponse {
    const session = this.sessions.findById(params.id);
    return { session: session.toSummary(), result: session.result };
  }

  /**
   * 진행 상황 스트림.
   * ReplaySubject 기반이라 구독이 늦어도 그 전 이벤트를 모두 받습니다.
   */
  @Sse(':id/events')
  stream(@Param() params: SessionIdParamDto): Observable<SseEnvelope> {
    return this.sessions
      .findById(params.id)
      .asObservable()
      .pipe(map((event) => ({ data: event })));
  }
}
