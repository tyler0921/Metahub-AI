import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AutonomousApprovalItem,
  AutonomousBacklogItem,
  AutonomousInboxResponse,
} from '@shared';
import type { AutonomousWorkConfig } from '../config/configuration';

interface InboxState extends AutonomousInboxResponse {
  version: 1;
}

const freshState = (): InboxState => ({ version: 1, backlog: [], approvals: [] });

@Injectable()
export class AutonomousInboxStore {
  private readonly path: string;
  private state: InboxState;

  constructor(config: ConfigService) {
    this.path = config.getOrThrow<AutonomousWorkConfig>('autonomousWork').inboxPath;
    this.state = this.load();
  }

  snapshot(): AutonomousInboxResponse {
    return {
      backlog: this.state.backlog.map((item) => ({ ...item })),
      approvals: this.state.approvals.map((item) => ({ ...item })),
    };
  }

  enqueue(brief: string, priority = 3): AutonomousBacklogItem {
    const item: AutonomousBacklogItem = {
      id: randomUUID(),
      brief,
      priority,
      status: 'queued',
      createdAt: new Date().toISOString(),
      sessionId: null,
    };
    this.state.backlog.unshift(item);
    this.save();
    return { ...item };
  }

  nextQueued(): AutonomousBacklogItem | null {
    const item = this.state.backlog
      .filter((candidate) => candidate.status === 'queued')
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt))[0];
    return item ? { ...item } : null;
  }

  markStarted(id: string, sessionId: string): void {
    const item = this.findBacklog(id);
    if (item.status !== 'queued') throw new BadRequestException('대기 중인 업무만 시작할 수 있습니다.');
    item.status = 'running';
    item.sessionId = sessionId;
    this.save();
  }

  markFinished(id: string, succeeded: boolean): void {
    const item = this.findBacklog(id);
    item.status = succeeded ? 'completed' : 'failed';
    this.save();
  }

  cancel(id: string): AutonomousBacklogItem {
    const item = this.findBacklog(id);
    if (item.status !== 'queued') throw new BadRequestException('대기 중인 업무만 취소할 수 있습니다.');
    item.status = 'cancelled';
    this.save();
    return { ...item };
  }

  requestApproval(sessionId: string, brief: string): AutonomousApprovalItem {
    const existing = this.state.approvals.find((item) => item.sessionId === sessionId);
    if (existing) return { ...existing };
    const item: AutonomousApprovalItem = {
      id: randomUUID(),
      sessionId,
      brief,
      status: 'pending',
      createdAt: new Date().toISOString(),
      decidedAt: null,
      note: null,
    };
    this.state.approvals.unshift(item);
    this.save();
    return { ...item };
  }

  decide(id: string, approved: boolean, note?: string): AutonomousApprovalItem {
    const item = this.state.approvals.find((candidate) => candidate.id === id);
    if (!item) throw new NotFoundException(`승인 항목을 찾을 수 없습니다: ${id}`);
    if (item.status !== 'pending') throw new BadRequestException('이미 처리된 승인 항목입니다.');
    item.status = approved ? 'approved' : 'rejected';
    item.decidedAt = new Date().toISOString();
    item.note = note?.trim() || null;
    this.save();
    return { ...item };
  }

  private findBacklog(id: string): AutonomousBacklogItem {
    const item = this.state.backlog.find((candidate) => candidate.id === id);
    if (!item) throw new NotFoundException(`백로그 항목을 찾을 수 없습니다: ${id}`);
    return item;
  }

  private load(): InboxState {
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<InboxState>;
      if (parsed.version !== 1 || !Array.isArray(parsed.backlog) || !Array.isArray(parsed.approvals)) {
        return freshState();
      }
      return { version: 1, backlog: parsed.backlog, approvals: parsed.approvals };
    } catch {
      return freshState();
    }
  }

  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
    renameSync(tempPath, this.path);
  }
}
