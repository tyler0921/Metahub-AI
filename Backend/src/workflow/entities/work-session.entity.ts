import { randomUUID } from 'node:crypto';
import type {
  AgentId,
  Deliverable,
  ReviewResult,
  SessionEvent,
  SessionStatus,
  SessionSummary,
  SpeechEvent,
  WorkPlan,
} from '@shared';
import { ReplaySubject, type Observable } from 'rxjs';
import { UsageTracker } from '../../llm/usage.tracker';

/**
 * 업무 세션 애그리게이트 루트.
 *
 * 한 번의 "대표 지시"에 대한 모든 상태(진행 단계, 초안, 대화록, 결과)를 들고 있고,
 * 이벤트 스트림도 여기서 발행합니다. ReplaySubject 를 쓰므로 구독이 늦어도
 * 그 사이에 발생한 이벤트를 놓치지 않습니다.
 */
export class WorkSessionEntity {
  readonly id: string = randomUUID();
  readonly createdAt: Date = new Date();
  readonly usage = new UsageTracker();

  private _status: SessionStatus = 'pending';
  private _plan: WorkPlan | null = null;
  private _review: ReviewResult | null = null;
  private _result: Deliverable | null = null;
  private startedAt = 0;

  /** 부서별 최신 원고 */
  readonly drafts = new Map<AgentId, string>();
  /** 부서 간 오간 모든 발언 (회의록의 원천) */
  readonly transcript: SpeechEvent[] = [];
  /** 각 부서에 내려진 지시 */
  readonly tasks = new Map<AgentId, string>();
  /** 모든 부서 프롬프트 앞에 붙는 공통 컨텍스트 */
  sharedContext = '';

  private readonly events$ = new ReplaySubject<SessionEvent>(500);

  /** 중단 신호 — 진행 중인 LLM 호출까지 끊습니다 */
  private readonly aborter = new AbortController();

  constructor(
    readonly brief: string,
    /** 이어서 고치는 원본 세션 (후속 지시) */
    readonly parentSessionId: string | null = null,
    /** 원본 세션의 산출물 — 후속 지시일 때만 채워집니다 */
    readonly parentResult: Deliverable | null = null,
  ) {}

  get signal(): AbortSignal {
    return this.aborter.signal;
  }

  get isCancelled(): boolean {
    return this._status === 'cancelled';
  }

  get isFollowUp(): boolean {
    return this.parentResult !== null;
  }

  /**
   * 대표가 중단을 눌렀을 때.
   * 진행 중인 LLM 호출을 즉시 끊고 스트림을 닫습니다.
   */
  cancel(): void {
    if (this._status !== 'running' && this._status !== 'pending') return;
    this._status = 'cancelled';
    this.aborter.abort();
    this.events$.next({ type: 'cancelled', reason: '대표 지시로 중단되었습니다.' });
    this.events$.complete();
  }

  /* ── 상태 ─────────────────────────────────────── */

  get status(): SessionStatus {
    return this._status;
  }

  get plan(): WorkPlan {
    if (!this._plan) throw new Error('업무 분해가 아직 끝나지 않았습니다.');
    return this._plan;
  }

  set plan(plan: WorkPlan) {
    this._plan = plan;
  }

  get review(): ReviewResult | null {
    return this._review;
  }

  set review(review: ReviewResult | null) {
    this._review = review;
  }

  get result(): Deliverable | null {
    return this._result;
  }

  /** 이번 지시에 투입된 부서 목록 */
  get team(): AgentId[] {
    return this._plan?.assignments.map((a) => a.agent) ?? [];
  }

  get elapsedSeconds(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }

  /* ── 생명주기 ─────────────────────────────────── */

  start(): void {
    this._status = 'running';
    this.startedAt = Date.now();
  }

  complete(result: Deliverable): void {
    this._status = 'completed';
    this._result = result;
    this.events$.next({ type: 'done', result });
    this.events$.complete();
  }

  fail(message: string): void {
    this._status = 'failed';
    this.events$.next({ type: 'error', message });
    this.events$.complete();
  }

  /* ── 이벤트 ───────────────────────────────────── */

  emit(event: SessionEvent): void {
    if (event.type === 'speech') this.transcript.push(event);
    this.events$.next(event);
  }

  asObservable(): Observable<SessionEvent> {
    return this.events$.asObservable();
  }

  toSummary(): SessionSummary {
    return {
      id: this.id,
      brief: this.brief,
      status: this._status,
      createdAt: this.createdAt.toISOString(),
      score: this._review?.score ?? null,
      parentSessionId: this.parentSessionId,
    };
  }
}
