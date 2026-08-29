import { Injectable } from '@nestjs/common';
import type { Assignment, ReviewResult, SpeechEvent, TokenUsage, WorkPlan } from '@shared';
import type { AgentEntity } from '../../agents/entities/agent.entity';
import {
  formatLocalDateTimeLabel,
  formatLocalTime,
} from '../../common/utils/date.util';
import type { VaultProjectEntity } from '../entities/vault-project.entity';

type FrontmatterValue = string | number | boolean | string[] | null | undefined;

/** 볼트 안에서 링크로 가리킬 대상 */
/** 개요 frontmatter 의 status — 인덱스 Dataview 쿼리가 이 값에 의존합니다 */
export type ProjectStatus = '진행중' | '완료' | '조건부완료' | '실패' | '중단';

export interface NoteLink {
  /** 볼트 루트 기준 경로 (확장자 없음) */
  target: string;
  label: string;
}

export interface OverviewInput {
  project: VaultProjectEntity;
  brief: string;
  plan: WorkPlan;
  resolveAgent: (assignment: Assignment) => AgentEntity;
  /** 이번 업무에서 실제로 참고한 과거 노트 */
  recalled?: NoteLink[];
  /** 후속 지시라면 원본 프로젝트 */
  parent?: NoteLink | null;
  /** 완료 후 다시 쓸 때만 채워집니다 */
  review?: ReviewResult | null;
  /** 검수로 설명되지 않는 결말('실패'·'중단')을 직접 지정할 때 */
  status?: ProjectStatus;
}

export interface DeliverableInput {
  project: VaultProjectEntity;
  brief: string;
  body: string;
  review: ReviewResult | null;
  usage: TokenUsage;
}

/**
 * 도메인 객체 → Obsidian 마크다운 직렬화 전담.
 *
 * 문서 서식을 바꾸고 싶으면 이 파일만 고치면 됩니다.
 * 파일 I/O 도, 비즈니스 로직도 여기 들어오지 않습니다.
 */
@Injectable()
export class NoteFormatter {
  /**
   * 프로젝트 개요.
   *
   * 이 노트가 볼트의 **허브**입니다. 프로젝트 안쪽(회의록·산출물)뿐 아니라
   * **바깥쪽**(참고한 과거 노트, 이어받은 원본 프로젝트)까지 링크를 겁니다.
   * 바깥 링크가 없으면 프로젝트마다 삼각형 하나씩 떠 있는 섬이 되고,
   * Obsidian 의 백링크·그래프가 아무 값어치도 못 합니다.
   */
  private statusOf(review: ReviewResult | null): ProjectStatus {
    if (!review) return '진행중';
    return review.verdict === 'approve' ? '완료' : '조건부완료';
  }

  overview(input: OverviewInput): string {
    const { project, brief, plan, resolveAgent } = input;
    const recalled = input.recalled ?? [];
    const review = input.review ?? null;

    return [
      this.frontmatter({
        type: 'ai-company-project',
        date: project.date,
        // 완료 검수가 들어오기 전까지는 진행중입니다
        status: input.status ?? this.statusOf(review),
        score: review?.score ?? null,
        kind: plan.kind,
        depts: plan.assignments.map((a) => resolveAgent(a).dept),
        tags: ['AI회사/프로젝트'],
      }),
      `# ${project.title}`,
      '',
      ...(input.parent
        ? [
            `> 이어받은 업무: ${this.link(input.parent)}`,
            '',
          ]
        : []),
      '## 🎤 대표 지시',
      this.quote(brief),
      '',
      '## 🎯 목표',
      plan.goal || '-',
      '',
      '## ✅ 성공 기준',
      ...(plan.successCriteria.length
        ? plan.successCriteria.map((c) => `- [ ] ${c}`)
        : ['- [ ] (미정)']),
      '',
      '## 👥 투입 부서',
      '| 담당자 | 부서 | 지시 사항 |',
      '| --- | --- | --- |',
      ...plan.assignments.map((a) => {
        const agent = resolveAgent(a);
        return `| ${agent.name} | ${agent.dept} | ${this.cell(a.task)} |`;
      }),
      '',
      /*
       * 회상한 노트를 링크로 남깁니다.
       *
       * 이 한 블록이 옛 노트 쪽에 **백링크**를 만듭니다. 그래야
       * "이 결론이 이후 어디에 재사용됐나" 를 거꾸로 추적할 수 있습니다.
       */
      ...(recalled.length
        ? [
            '## 📚 참고한 과거 기록',
            ...recalled.map((note) => `- ${this.link(note)}`),
            '',
          ]
        : []),
      '## 🔗 관련 노트',
      '- [[01 회의록]]',
      '- [[산출물]]',
      '',
    ].join('\n');
  }

  minutes(project: VaultProjectEntity, transcript: SpeechEvent[], resolve: (id: string) => AgentEntity): string {
    return [
      this.frontmatter({
        type: 'ai-company-minutes',
        date: project.date,
        tags: ['AI회사', '회의록'],
      }),
      '# 01 회의록',
      '',
      '부서 간 오간 모든 대화 기록입니다.',
      '',
      ...transcript.flatMap((entry) => {
        const time = formatLocalTime(new Date(entry.at));
        const from = resolve(entry.agent).displayName;
        const to = entry.to ? ` → ${resolve(entry.to).displayName}` : '';
        return [`### ${time} · ${from}${to} (${entry.phase})`, '', entry.text, ''];
      }),
    ].join('\n');
  }

  departmentNote(
    project: VaultProjectEntity,
    agent: AgentEntity,
    body: string,
    task: string,
  ): string {
    return [
      this.frontmatter({
        type: 'ai-company-dept',
        date: project.date,
        agent: agent.name,
        dept: agent.dept,
        tags: ['AI회사', agent.dept],
      }),
      `# ${agent.emoji} ${agent.dept} — ${agent.displayName}`,
      '',
      task ? `> **지시받은 업무**: ${this.cell(task)}\n` : '',
      body,
      '',
      '---',
      '상위 노트: [[00 개요]]',
      '',
    ].join('\n');
  }

  deliverable(input: DeliverableInput): string {
    const { project, brief, body, review, usage } = input;

    return [
      this.frontmatter({
        type: 'ai-company-deliverable',
        date: project.date,
        status: review?.verdict === 'approve' ? '승인' : '조건부승인',
        score: review?.score ?? null,
        tags: ['AI회사', '산출물'],
      }),
      `# 📦 산출물 — ${project.title}`,
      '',
      `> **대표 지시**: ${this.cell(brief)}`,
      '',
      body,
      '',
      '---',
      '',
      '## 🧐 비서실장 검수 의견',
      ...this.reviewBlock(review),
      '',
      '---',
      '관련: [[00 개요]] · [[01 회의록]]',
      '',
      `<small>문서 생성: ${formatLocalDateTimeLabel()} · 토큰 사용량 — 입력 ${usage.inputTokens.toLocaleString()} / 출력 ${usage.outputTokens.toLocaleString()} / 호출 ${usage.calls}회</small>`,
      '',
    ].join('\n');
  }

  /**
   * 프로젝트 인덱스.
   *
   * 예전에는 세션마다 표에 한 줄을 문자열로 잘라 붙였습니다. 개요 노트의
   * frontmatter 에 이미 date·status·score·kind 가 다 들어 있으므로,
   * **쿼리 한 벌**로 대체합니다. 누적 로직이 통째로 사라지고, 노트를 손으로
   * 지워도 표가 저절로 맞습니다.
   *
   * Dataview 플러그인이 없으면 코드블록이 그대로 보입니다 — 그 경우를 위해
   * 폴더 링크를 함께 남겨 둡니다.
   */
  index(): string {
    return [
      this.frontmatter({ type: 'ai-company-index', tags: ['AI회사'] }),
      '# 🏢 AI 회사 — 프로젝트 인덱스',
      '',
      '> 이 표는 각 프로젝트 개요 노트의 frontmatter 를 읽어 자동으로 그려집니다.',
      '> (Obsidian 의 Dataview 플러그인이 필요합니다)',
      '',
      '## 진행 중',
      '',
      '```dataview',
      'TABLE date AS 날짜, depts AS 부서',
      'FROM #AI회사/프로젝트',
      'WHERE status = "진행중"',
      'SORT date DESC',
      '```',
      '',
      '## 완료',
      '',
      '```dataview',
      'TABLE date AS 날짜, score AS 점수, kind AS 종류, depts AS 부서',
      'FROM #AI회사/프로젝트',
      'WHERE status = "완료" OR status = "조건부완료"',
      'SORT date DESC',
      '```',
      '',
      '## 중단·실패',
      '',
      '```dataview',
      'TABLE date AS 날짜, status AS 상태, depts AS 부서',
      'FROM #AI회사/프로젝트',
      'WHERE status = "실패" OR status = "중단"',
      'SORT date DESC',
      '```',
      '',
      '## 점수가 낮았던 건 (다시 볼 것)',
      '',
      '```dataview',
      'TABLE date AS 날짜, score AS 점수',
      'FROM #AI회사/프로젝트',
      'WHERE score != null AND score < 80',
      'SORT score ASC',
      '```',
      '',
      '---',
      '',
      '플러그인이 없다면 `프로젝트` 폴더를 직접 여세요.',
      '',
    ].join('\n');
  }

  /**
   * 부서 지식 노트에 이번에 배운 것을 얹는다.
   *
   * 기존 내용을 **읽어서 앞에 끼워 넣습니다.** 통째로 다시 쓰면 사람이
   * 손으로 고친 부분이 매번 날아갑니다. 새 항목은 위로 쌓아 최근 것이
   * 먼저 보이게 하고, 링크로 출처 프로젝트를 남깁니다.
   */
  knowledgeWithNewLessons(
    previous: string | null,
    dept: string,
    lessons: string[],
    source: NoteLink,
    date: string,
  ): string {
    const marker = '## 배운 것';

    const header = [
      this.frontmatter({
        type: 'ai-company-knowledge',
        dept,
        tags: ['AI회사/지식'],
      }),
      `# ${dept} 지식`,
      '',
      `${dept}이 업무를 거치며 반복해서 확인한 것들입니다.`,
      '아래 목록은 세션이 끝날 때마다 자동으로 쌓입니다 — 손으로 고쳐도 지워지지 않습니다.',
      '',
      marker,
      '',
    ].join('\n');

    const entries = lessons
      .map((lesson) => `- ${this.cell(lesson)} <small>(${date} · ${this.link(source)})</small>`)
      .join('\n');

    if (!previous) return `${header}${entries}\n`;

    const at = previous.indexOf(marker);
    if (at === -1) {
      // 사람이 구조를 바꿔 놓은 경우 — 덮어쓰지 않고 맨 뒤에 붙입니다
      return `${previous.trimEnd()}\n\n${marker}\n\n${entries}\n`;
    }

    const head = previous.slice(0, at + marker.length);
    const rest = previous.slice(at + marker.length).trim();
    return `${head}\n\n${entries}\n${rest ? `${rest}\n` : ''}`;
  }

  /* ── 내부 유틸 ─────────────────────────────── */

  private reviewBlock(review: ReviewResult | null): string[] {
    if (!review) return ['-'];

    const lines = [
      `**판정**: ${review.verdict === 'approve' ? '승인 ✅' : '조건부 승인 ⚠️'} (${review.score}점)`,
      '',
    ];
    if (review.strengths.length) {
      lines.push('**잘된 점**', ...review.strengths.map((s) => `- ${s}`), '');
    }
    if (review.issues.length) {
      lines.push('**남은 이슈**', ...review.issues.map((s) => `- ${s}`), '');
    }
    if (review.note) lines.push(review.note);
    return lines;
  }

  private frontmatter(fields: Record<string, FrontmatterValue>): string {
    const lines = ['---'];
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      lines.push(`${key}: ${Array.isArray(value) ? `[${value.join(', ')}]` : value}`);
    }
    lines.push('---', '');
    return lines.join('\n');
  }

  /** `[[경로|라벨]]` — 라벨이 경로 끝과 같으면 파이프를 생략합니다 */
  private link(note: NoteLink): string {
    const tail = note.target.split('/').at(-1);
    return tail === note.label
      ? `[[${note.target}]]`
      : `[[${note.target}|${note.label}]]`;
  }

  private quote(text: string): string {
    return `> ${text.split('\n').join('\n> ')}`;
  }

  /** 표 셀에 넣어도 깨지지 않게 개행·파이프 처리 */
  private cell(text: string): string {
    return String(text ?? '')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\|/g, '\\|')
      .trim();
  }
}
