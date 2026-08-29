import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type {
  RecalledNote,
  ReviewResult,
  SpeechEvent,
  TokenUsage,
  VaultProjectsResponse,
  WorkPlan,
} from '@shared';
import { AgentsService } from '../agents/agents.service';
import type { AgentEntity } from '../agents/entities/agent.entity';
import { VaultEmbeddingStore } from './embedding/vault-embedding.store';
import { VaultNoteEntity } from './entities/vault-note.entity';
import type { VaultProjectEntity } from './entities/vault-project.entity';
import { NoteFormatter, type ProjectStatus } from './formatters/note.formatter';
import { VaultRepository } from './repositories/vault.repository';

interface ScoredNote {
  note: VaultNoteEntity;
  score: number;
}

/**
 * 관련 있다고 인정할 최소 기준.
 *
 * 이게 없으면 흔한 단어 하나("개발", "전략")만 스쳐도 후보에 올라오고,
 * 후보가 적은 날에는 그 무관한 노트가 그대로 상위 4건에 들어갑니다.
 * 회상은 **적게 맞히는 것보다 엉뚱한 걸 넣는 쪽이 더 해롭습니다** —
 * 부서 프롬프트가 통째로 오염되기 때문입니다.
 */
const MIN_COVERAGE = 0.3;
const MIN_SCORE = 2;

/**
 * 임베딩만으로 후보에 오를 수 있는 최소 유사도(0~1 정규화 코사인).
 *
 * 키워드가 하나도 안 겹쳐도 이 이상이면 동의어·문맥 일치로 보고 살립니다.
 * `nomic-embed-text` 기준 무관한 문서끼리도 0.4~0.5대는 흔히 나오므로
 * 여유를 두고 0.62로 잡았습니다.
 */
const SEMANTIC_MIN = 0.62;

/** 검색 정확도를 떨어뜨리는 흔한 어미·조사 */
const STOP_WORDS = new Set([
  '그리고', '하지만', '해줘', '해주세요', '만들어', '우리', '대해', '대한',
  '위한', '있는', '하는', '에서', '으로', '에게', '부터', '까지', '합니다',
  '입니다', '것을', '것이', '정리', '작성', '알려', '전략', '방안',
]);

/**
 * 볼트 도메인 서비스 — "공용 기억"의 구현체.
 *
 * 파일 I/O 는 VaultRepository 가, 마크다운 서식은 NoteFormatter 가 맡습니다.
 * 이 서비스는 "무엇을 언제 저장하고 어떻게 회상할지"만 결정합니다.
 */
@Injectable()
export class VaultService implements OnModuleInit {
  private readonly logger = new Logger(VaultService.name);

  constructor(
    private readonly repository: VaultRepository,
    private readonly formatter: NoteFormatter,
    private readonly agents: AgentsService,
    private readonly embeddings: VaultEmbeddingStore,
  ) {}

  onModuleInit(): void {
    // 부팅 직후 한 번 — 예전에 끊긴 세션이 남긴 '진행중' 개요를 정리합니다
    void this.reconcileStaleProjects().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`진행중 프로젝트 정리에 실패했습니다: ${message}`);
    });
  }

  get basePath(): string {
    return this.repository.basePath;
  }

  get vaultPath(): string {
    return this.repository.vaultPath;
  }

  /* ── 회상 (읽기) ──────────────────────────────── */

  /**
   * 지시문과 관련된 과거 노트를 찾는다.
   *
   * 점수를 **문서 길이로 정규화**하는 게 핵심입니다. 그러지 않으면
   * 회의록처럼 긴 노트가 어떤 검색어에도 상한선까지 걸려서 항상 1등이 되고,
   * 정작 밀도가 높은 산출물이 밀려납니다. TF-IDF 의 길이 정규화와 같은 발상이며,
   * `√길이` 로 나눠 짧은 노트가 지나치게 유리해지는 것도 함께 막습니다.
   */
  async recall(query: string, limit = 4): Promise<VaultNoteEntity[]> {
    const terms = this.tokenize(query);
    if (terms.length === 0) return [];

    const notes = await this.repository.loadAllNotes();
    const candidates = notes.filter((note) => !note.excludedFromRecall);

    // 임베딩이 꺼져 있거나 서버에 닿지 못하면 null — 이 경우 아래 루프는
    // 원래의 키워드 전용 로직과 완전히 동일하게 동작합니다 (하위 호환 폴백)
    const semanticMap = await this.embeddings.similarities(query, candidates, (note) =>
      `${note.title}\n${this.excerpt(note.body, 2000)}`,
    );

    const scored: ScoredNote[] = [];

    for (const note of candidates) {
      const haystack = `${note.title}\n${note.body}`.toLowerCase();
      const title = note.title.toLowerCase();
      let raw = 0;
      let matchedTerms = 0;

      for (const term of terms) {
        const hits = haystack.split(term).length - 1;
        if (hits > 0) {
          // 같은 단어를 여러 번 쓴 것보다 **여러 단어가 겹치는 것**이 중요합니다
          raw += 1 + Math.log2(Math.min(hits, 16));
          matchedTerms += 1;
        }
        if (title.includes(term)) raw += 4;
      }

      // 검색어를 골고루 맞힌 노트에 가산점 (1개만 반복된 노트를 눌러줍니다)
      const coverage = matchedTerms / terms.length;
      const lengthPenalty = Math.sqrt(Math.max(note.bodyLength, 400) / 400);
      const keywordScore = matchedTerms > 0 ? (raw * (0.5 + coverage)) / lengthPenalty : 0;
      // 검색어를 거의 못 맞혔거나 점수가 낮으면 키워드만으로는 관련 없다고 봅니다
      const keywordQualifies =
        matchedTerms > 0 && coverage >= MIN_COVERAGE && keywordScore >= MIN_SCORE;

      if (semanticMap === null) {
        if (!keywordQualifies) continue;
        scored.push({ note, score: keywordScore });
        continue;
      }

      // 동의어·문맥 일치는 키워드가 하나도 안 겹쳐도 의미 유사도로 살립니다
      const semanticScore = semanticMap.get(note.relativePath) ?? 0;
      if (!keywordQualifies && semanticScore < SEMANTIC_MIN) continue;

      const score =
        matchedTerms > 0
          ? 0.45 * this.normalizeKeywordScore(keywordScore) + 0.55 * semanticScore
          : semanticScore;
      scored.push({ note, score });
    }

    return scored
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.note.modifiedAt.getTime() - a.note.modifiedAt.getTime(),
      )
      .slice(0, limit)
      .map((s) => s.note);
  }

  /** 키워드 원점수를 시맨틱 점수와 같은 0~1 스케일로 눌러줍니다 (score=4 → 0.5) */
  private normalizeKeywordScore(score: number): number {
    return score / (score + 4);
  }

  /** 회상 결과를 각 부서 프롬프트에 끼워 넣을 텍스트로 변환 */
  buildRecallContext(notes: VaultNoteEntity[]): string {
    if (notes.length === 0) return '';

    return [
      '',
      '## 📚 사내 지식 저장소(Obsidian)에서 찾은 과거 기록',
      '아래는 우리 회사가 과거에 남긴 관련 노트입니다. 중복 작업을 피하고 일관성을 유지하는 데 활용하세요.',
      '',
      ...notes.map(
        (note, i) =>
          `### ${i + 1}. ${note.label}\n경로: \`${note.relativePath}\`\n\n${this.excerpt(note.body, 600)}\n`,
      ),
      '---',
      '',
    ].join('\n');
  }

  toRecalledNotes(notes: VaultNoteEntity[]): RecalledNote[] {
    return notes.map((n) => ({ title: n.label, path: n.relativePath }));
  }

  /* ── 보존 (쓰기) ──────────────────────────────── */

  createProject(brief: string): Promise<VaultProjectEntity> {
    return this.repository.createProject(brief);
  }

  /**
   * 개요 노트를 쓴다.
   *
   * 세션 시작 때 한 번(진행중), 완료 때 한 번 더(완료 + 점수) 호출합니다.
   * 두 번째 호출이 status 를 갱신하는 유일한 경로입니다 — 그러지 않으면
   * 볼트의 모든 프로젝트가 영원히 "진행중"으로 남습니다.
   */
  async saveOverview(
    project: VaultProjectEntity,
    brief: string,
    plan: WorkPlan,
    options: {
      recalled?: VaultNoteEntity[];
      parent?: { folderName: string; title: string } | null;
      review?: ReviewResult | null;
      /** 실패·중단처럼 검수 결과로 설명되지 않는 결말 */
      status?: ProjectStatus;
    } = {},
  ): Promise<void> {
    const content = this.formatter.overview({
      project,
      brief,
      plan,
      resolveAgent: (a) => this.agents.findById(a.agent),
      recalled: (options.recalled ?? []).map((note) => ({
        target: note.relativePath.replace(/\.md$/i, ''),
        label: note.label,
      })),
      parent: options.parent
        ? {
            target: `${this.repository.projectsFolder}/${options.parent.folderName}/00 개요`,
            label: options.parent.title,
          }
        : null,
      review: options.review ?? null,
      status: options.status,
    });
    await this.repository.write(project.overviewPath, content);
  }

  async saveMinutes(
    project: VaultProjectEntity,
    transcript: SpeechEvent[],
  ): Promise<void> {
    const content = this.formatter.minutes(project, transcript, (id) =>
      this.agents.findById(id as AgentEntity['id']),
    );
    await this.repository.write(project.minutesPath, content);
  }

  async saveDepartmentNote(
    project: VaultProjectEntity,
    agent: AgentEntity,
    body: string,
    task: string,
  ): Promise<void> {
    const content = this.formatter.departmentNote(project, agent, body, task);
    await this.repository.write(project.departmentNotePath(agent.dept), content);
  }

  async saveDeliverable(
    project: VaultProjectEntity,
    brief: string,
    body: string,
    review: ReviewResult | null,
    usage: TokenUsage,
  ): Promise<string> {
    const content = this.formatter.deliverable({
      project,
      brief,
      body,
      review,
      usage,
    });
    await this.repository.write(project.deliverablePath, content);
    return project.deliverablePath;
  }

  /**
   * 부서가 이번에 배운 것을 누적 지식 노트에 남긴다.
   *
   * 회상은 이 노트를 특히 잘 물어옵니다 — 짧고 밀도가 높아서
   * 길이 정규화를 거치면 긴 프로젝트 노트보다 점수가 높게 나옵니다.
   * 의도한 결과입니다. 원문을 다시 뒤지는 것보다 요약을 먼저 보는 게 낫습니다.
   */
  async appendDepartmentKnowledge(
    dept: string,
    lessons: string[],
    project: VaultProjectEntity,
  ): Promise<void> {
    if (lessons.length === 0) return;

    const notePath = this.repository.knowledgePath(dept);
    const previous = await this.repository.readIfExists(notePath);

    const content = this.formatter.knowledgeWithNewLessons(
      previous,
      dept,
      lessons,
      {
        target: `${this.repository.projectsFolder}/${project.folderName}/00 개요`,
        label: project.title,
      },
      project.date,
    );

    await this.repository.write(notePath, content);
  }

  /**
   * 인덱스 노트를 최신 형태로 덮어씁니다.
   *
   * 더 이상 "행을 붙이는" 일이 아닙니다. 내용이 쿼리라서 매번 같은 글이
   * 쓰이고, 실제 목록은 Obsidian 이 개요 노트들의 frontmatter 를 읽어 그립니다.
   */
  async refreshIndex(): Promise<void> {
    await this.repository.write(this.repository.indexPath, this.formatter.index());
  }

  /**
   * 영원히 '진행중' 으로 남은 개요를 고칩니다.
   *
   * 산출물이 있으면 완료로, 없으면 중단으로 바꿉니다.
   * 예전에 실패·취소 시 개요를 갱신하지 않던 버전의 잔재입니다.
   */
  async reconcileStaleProjects(): Promise<number> {
    const projects = await this.repository.listProjects(500);
    let changed = 0;

    for (const project of projects) {
      const content = await this.repository.readIfExists(project.overviewPath);
      if (!content || !/^status:\s*진행중\s*$/m.test(content)) continue;

      const deliverable = await this.repository.readIfExists(project.deliverablePath);
      const nextStatus = deliverable ? '완료' : '중단';
      const updated = content.replace(/^status:\s*진행중\s*$/m, `status: ${nextStatus}`);
      if (updated === content) continue;

      await this.repository.write(project.overviewPath, updated);
      changed += 1;
    }

    if (changed > 0) {
      await this.refreshIndex();
      this.logger.log(`진행중이던 개요 ${changed}건을 정리했습니다.`);
    }
    return changed;
  }

  /* ── 조회 API 용 ──────────────────────────────── */

  async listProjects(): Promise<VaultProjectsResponse> {
    const projects = await this.repository.listProjects();
    return {
      basePath: this.repository.basePath,
      projects: projects.map((p) => p.toSummary()),
    };
  }

  async readNote(relativePath: string): Promise<string> {
    const content = await this.repository.readNoteByRelativePath(relativePath);
    if (content === null) {
      throw new NotFoundException(`노트를 찾을 수 없습니다: ${relativePath}`);
    }
    return content;
  }

  /* ── 내부 유틸 ────────────────────────────────── */

  private tokenize(query: string): string[] {
    return query
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/i)
      .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
      .slice(0, 12);
  }

  private excerpt(body: string, max: number): string {
    if (body.length <= max) return body;
    return `${body.slice(0, max).trim()}…`;
  }
}
