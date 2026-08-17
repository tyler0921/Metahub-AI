import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Deliverable,
  SessionDetailResponse,
  SessionEvent,
  SessionSummary,
} from '@shared';
import { from, type Observable, type Subscription } from 'rxjs';
import type { WorkflowConfig } from '../../config/configuration';
import { WorkSessionEntity } from '../entities/work-session.entity';

/**
 * 세션 저장소 (인메모리).
 *
 * 인터페이스가 단순하므로 Redis 나 RDB 로 바꾸더라도
 * WorkflowService 코드는 손대지 않아도 됩니다.
 */
@Injectable()
export class SessionRepository implements OnModuleDestroy {
  private readonly logger = new Logger(SessionRepository.name);
  private readonly sessions = new Map<string, WorkSessionEntity>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly database: DatabaseSync;
  private readonly sweeper: NodeJS.Timeout;
  private readonly ttlMs: number;

  constructor(config: ConfigService) {
    const workflow = config.getOrThrow<WorkflowConfig>('workflow');
    this.ttlMs = workflow.sessionTtlMs;
    mkdirSync(dirname(workflow.sessionDatabasePath), { recursive: true });
    this.database = new DatabaseSync(workflow.sessionDatabasePath);
    this.initializeDatabase();
    // 오래된 세션을 주기적으로 비워 메모리 누수를 막는다
    this.sweeper = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    for (const subscription of this.subscriptions.values()) subscription.unsubscribe();
    this.database.close();
  }

  create(brief: string, parentSessionId?: string): WorkSessionEntity {
    // 후속 지시면 원본 산출물을 물려받아 처음부터 다시 하지 않습니다
    const parent = parentSessionId ? this.findDetailOrNull(parentSessionId) : null;
    if (parentSessionId && !parent) {
      throw new NotFoundException(`이어서 작업할 세션을 찾을 수 없습니다: ${parentSessionId}`);
    }

    const session = new WorkSessionEntity(
      brief,
      parent?.session.id ?? null,
      parent?.result ?? null,
    );
    this.sessions.set(session.id, session);
    this.persistSession(session);
    const subscription = session.asObservable().subscribe({
      next: (event) => {
        this.persistEvent(session.id, event);
        this.persistSession(session);
      },
      complete: () => this.subscriptions.delete(session.id),
    });
    this.subscriptions.set(session.id, subscription);
    return session;
  }

  findById(id: string): WorkSessionEntity {
    const session = this.sessions.get(id);
    if (!session) throw new NotFoundException(`세션을 찾을 수 없습니다: ${id}`);
    return session;
  }

  findRecent(limit = 20): WorkSessionEntity[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  findRecentSummaries(limit = 20): SessionSummary[] {
    return this.database
      .prepare(`
        SELECT id, brief, status, created_at, score, parent_session_id
        FROM sessions
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(limit)
      .map((row) => this.rowToSummary(row as unknown as SessionRow));
  }

  findDetail(id: string): SessionDetailResponse {
    const detail = this.findDetailOrNull(id);
    if (!detail) throw new NotFoundException(`세션을 찾을 수 없습니다: ${id}`);
    return detail;
  }

  findEvents(id: string): Observable<SessionEvent> {
    const active = this.sessions.get(id);
    if (active) return active.asObservable();

    this.findDetail(id);
    const events = this.database
      .prepare('SELECT payload_json FROM session_events WHERE session_id = ? ORDER BY sequence ASC')
      .all(id)
      .map((row) =>
        JSON.parse((row as unknown as EventRow).payload_json) as SessionEvent,
      );
    return from(events);
  }

  findActive(): WorkSessionEntity | null {
    return [...this.sessions.values()].find(
      (session) => session.status === 'pending' || session.status === 'running',
    ) ?? null;
  }

  private sweep(): void {
    const deadline = Date.now() - this.ttlMs;
    let removed = 0;

    for (const [id, session] of this.sessions) {
      const finished =
        session.status === 'completed' ||
        session.status === 'failed' ||
        session.status === 'cancelled';
      if (finished && session.createdAt.getTime() < deadline) {
        this.sessions.delete(id);
        removed++;
      }
    }
    if (removed > 0) this.logger.log(`만료된 세션 ${removed}건을 정리했습니다.`);
  }

  private initializeDatabase(): void {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        brief TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        score REAL,
        parent_session_id TEXT,
        result_json TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id, sequence);
    `);

    const interrupted = this.database
      .prepare("SELECT id FROM sessions WHERE status IN ('pending', 'running')")
      .all() as Array<{ id: string }>;
    if (interrupted.length === 0) return;

    const now = new Date().toISOString();
    const update = this.database.prepare(
      "UPDATE sessions SET status = 'failed', updated_at = ? WHERE id = ?",
    );
    const insert = this.database.prepare(
      'INSERT INTO session_events(session_id, payload_json, created_at) VALUES (?, ?, ?)',
    );
    for (const { id } of interrupted) {
      update.run(now, id);
      insert.run(
        id,
        JSON.stringify({ type: 'error', message: '서버 재시작으로 이전 작업이 중단되었습니다.' }),
        now,
      );
    }
    this.logger.warn(`재시작 중 중단된 세션 ${interrupted.length}건을 실패 상태로 복구했습니다.`);
  }

  private persistSession(session: WorkSessionEntity): void {
    const summary = session.toSummary();
    this.database
      .prepare(`
        INSERT INTO sessions(
          id, brief, status, created_at, score, parent_session_id, result_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          score = excluded.score,
          result_json = excluded.result_json,
          updated_at = excluded.updated_at
      `)
      .run(
        summary.id,
        summary.brief,
        summary.status,
        summary.createdAt,
        summary.score,
        summary.parentSessionId,
        session.result ? JSON.stringify(session.result) : null,
        new Date().toISOString(),
      );
  }

  private persistEvent(sessionId: string, event: SessionEvent): void {
    this.database
      .prepare(
        'INSERT INTO session_events(session_id, payload_json, created_at) VALUES (?, ?, ?)',
      )
      .run(sessionId, JSON.stringify(event), new Date().toISOString());
  }

  private findDetailOrNull(id: string): SessionDetailResponse | null {
    const active = this.sessions.get(id);
    if (active) return { session: active.toSummary(), result: active.result };

    const row = this.database
      .prepare(`
        SELECT id, brief, status, created_at, score, parent_session_id, result_json
        FROM sessions WHERE id = ?
      `)
      .get(id) as SessionDetailRow | undefined;
    if (!row) return null;
    return {
      session: this.rowToSummary(row),
      result: row.result_json ? (JSON.parse(row.result_json) as Deliverable) : null,
    };
  }

  private rowToSummary(row: SessionRow): SessionSummary {
    return {
      id: row.id,
      brief: row.brief,
      status: row.status as SessionSummary['status'],
      createdAt: row.created_at,
      score: row.score,
      parentSessionId: row.parent_session_id,
    };
  }
}

interface SessionRow {
  id: string;
  brief: string;
  status: string;
  created_at: string;
  score: number | null;
  parent_session_id: string | null;
}

interface SessionDetailRow extends SessionRow {
  result_json: string | null;
}

interface EventRow {
  payload_json: string;
}
