import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Deliverable, ReviewResult } from '@shared';
import { AgentsService } from '../agents/agents.service';
import type { WorkflowConfig } from '../config/configuration';
import { LlmCancelledError } from '../llm/errors/llm.errors';
import { LlmService } from '../llm/llm.service';
import { VaultService } from '../vault/vault.service';
import type { WorkSessionEntity } from './entities/work-session.entity';
import { DraftPhase } from './phases/draft.phase';
import { FeedbackPhase, type FeedbackInbox } from './phases/feedback.phase';
import { IntegratePhase } from './phases/integrate.phase';
import { KickoffPhase } from './phases/kickoff.phase';
import { ReviewPhase } from './phases/review.phase';
import { RevisePhase } from './phases/revise.phase';
import type { PhaseContext } from './phases/workflow-phase.interface';
import { SessionRepository } from './repositories/session.repository';

/**
 * SOP 파이프라인 오케스트레이터.
 *
 * 각 단계의 **내용**은 Phase 서비스들이 알고, 이 서비스는 **순서와 반복**만 결정합니다.
 * 단계를 추가하려면 Phase 를 하나 만들어 이 흐름에 끼워 넣으면 됩니다.
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);
  private readonly config: WorkflowConfig;

  constructor(
    configService: ConfigService,
    private readonly sessions: SessionRepository,
    private readonly agents: AgentsService,
    private readonly vault: VaultService,
    private readonly llm: LlmService,
    private readonly kickoff: KickoffPhase,
    private readonly draft: DraftPhase,
    private readonly feedback: FeedbackPhase,
    private readonly revise: RevisePhase,
    private readonly integrate: IntegratePhase,
    private readonly review: ReviewPhase,
  ) {
    this.config = configService.getOrThrow<WorkflowConfig>('workflow');
  }

  /** 세션을 만들고 백그라운드로 파이프라인을 돌린다 (응답은 즉시 반환) */
  createSession(brief: string, parentSessionId?: string): WorkSessionEntity {
    const session = this.sessions.create(brief, parentSessionId);

    void this.execute(session).catch((error: unknown) => {
      // 대표가 중단한 경우는 실패가 아닙니다 — 이벤트는 cancel() 이 이미 보냈습니다
      if (error instanceof LlmCancelledError || session.isCancelled) {
        this.logger.log(`세션 ${session.id} 중단됨 (${session.elapsedSeconds}초 경과)`);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`세션 ${session.id} 실패: ${message}`);
      session.fail(message);
    });

    return session;
  }

  /** 대표 지시로 진행 중인 세션을 중단합니다 */
  cancelSession(id: string): WorkSessionEntity {
    const session = this.sessions.findById(id);
    session.cancel();
    return session;
  }

  /**
   * 단계와 단계 사이의 중단 확인.
   *
   * LLM 호출은 signal 로 즉시 끊기지만, 볼트 저장처럼 중간에 끼는 작업은
   * 신호를 받지 않으므로 여기서 한 번씩 확인해 흐름을 끊습니다.
   */
  private checkpoint(session: WorkSessionEntity): void {
    if (session.isCancelled) throw new LlmCancelledError();
  }

  private async execute(session: WorkSessionEntity): Promise<void> {
    session.start();
    session.emit({
      type: 'boot',
      sessionId: session.id,
      provider: this.llm.providerName,
      model: this.llm.model,
      vaultPath: this.vault.basePath,
    });

    /* 0. 회상 — 볼트에서 과거 기록을 찾아 전 부서에 공유 */
    session.emit({ type: 'phase', key: 'recall', label: '사내 지식 저장소 검색' });
    session.emit({ type: 'status', agent: 'chief', status: 'thinking', note: '과거 기록 확인 중' });

    const recalled = await this.vault.recall(session.brief);
    const recallContext = this.vault.buildRecallContext(recalled);
    const context: PhaseContext = { session, agents: this.agents, recallContext };

    if (recalled.length > 0) {
      session.emit({ type: 'recall', notes: this.vault.toRecalledNotes(recalled) });
      this.speakAsChief(
        session,
        `볼트에서 관련 노트 ${recalled.length}건을 찾았습니다: ${recalled.map((n) => n.label).join(' / ')}. 각 부서에 함께 전달하겠습니다.`,
      );
    } else {
      this.speakAsChief(session, '관련된 과거 기록은 없습니다. 백지에서 시작합니다.');
    }
    session.emit({ type: 'status', agent: 'chief', status: 'idle', note: '' });

    /* 1. 착수 */
    this.checkpoint(session);
    session.emit({ type: 'phase', key: this.kickoff.key, label: this.kickoff.label });
    await this.kickoff.execute(context);

    const project = await this.vault.createProject(session.brief);
    await this.vault.saveOverview(project, session.brief, session.plan);

    /* 2. 초안 */
    this.checkpoint(session);
    session.emit({ type: 'phase', key: this.draft.key, label: this.draft.label });
    await this.draft.execute(context);

    /* 3~4. 교차검토 · 개정 (설정된 라운드만큼 반복) */
    for (let round = 0; round < this.config.feedbackRounds; round++) {
      const suffix =
        this.config.feedbackRounds > 1 ? ` (${round + 1}/${this.config.feedbackRounds})` : '';

      this.checkpoint(session);
      session.emit({ type: 'phase', key: this.feedback.key, label: this.feedback.label + suffix });
      const inbox: FeedbackInbox = await this.feedback.collect(context);

      this.checkpoint(session);
      session.emit({ type: 'phase', key: this.revise.key, label: this.revise.label });
      await this.revise.apply(context, inbox);
    }

    for (const agentId of session.team) {
      await this.vault.saveDepartmentNote(
        project,
        this.agents.findById(agentId),
        session.drafts.get(agentId) ?? '',
        session.tasks.get(agentId) ?? '',
      );
    }

    /* 5~6. 통합 · 검수 (반려 시 재작업) */
    let merged = '';
    let verdict: ReviewResult | null = null;

    for (let attempt = 0; attempt <= this.config.maxRework; attempt++) {
      this.checkpoint(session);
      session.emit({
        type: 'phase',
        key: this.integrate.key,
        label: attempt === 0 ? this.integrate.label : '문서팀 재작업',
      });
      merged = await this.integrate.merge(context, {
        attempt,
        previousDraft: merged,
        rejection: verdict,
      });

      this.checkpoint(session);
      session.emit({ type: 'phase', key: this.review.key, label: this.review.label });
      verdict = await this.review.judge(context, merged, attempt, this.config.maxRework);
      session.review = verdict;

      if (verdict.verdict === 'approve') break;
    }

    /* 7. 보존 — 여기까지 왔으면 중단하지 않고 결과를 남깁니다 */
    this.checkpoint(session);
    session.emit({ type: 'phase', key: 'save', label: 'Obsidian 볼트 저장' });
    await this.vault.saveMinutes(project, session.transcript);
    await this.vault.saveDeliverable(
      project,
      session.brief,
      merged,
      verdict,
      session.usage.snapshot(),
    );
    await this.vault.appendToIndex(project, session.brief, verdict?.score ?? null);

    const result: Deliverable = {
      sessionId: session.id,
      brief: session.brief,
      body: merged,
      review: verdict,
      plan: session.plan,
      team: session.team,
      vaultFolder: project.folderName,
      elapsedSeconds: session.elapsedSeconds,
      usage: session.usage.snapshot(),
      parentSessionId: session.parentSessionId ?? undefined,
    };
    session.complete(result);
    this.logger.log(
      `세션 ${session.id} 완료 — ${result.elapsedSeconds}초, LLM ${result.usage.calls}회 호출`,
    );
  }

  private speakAsChief(session: WorkSessionEntity, text: string): void {
    session.emit({
      type: 'speech',
      agent: 'chief',
      to: null,
      phase: '회상',
      text,
      at: Date.now(),
    });
  }
}
