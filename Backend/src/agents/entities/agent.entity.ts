import type { Agent, AgentId, AgentKind, AgentRank, DeskPosition, TeamId } from '@shared';

/**
 * AI 직원 엔티티.
 *
 * `systemPrompt` 는 회사의 자산이므로 절대 외부로 나가지 않습니다.
 * 컨트롤러는 `toPublic()` 으로 변환한 값만 응답합니다.
 */
export class AgentEntity {
  constructor(
    readonly id: AgentId,
    readonly name: string,
    readonly title: string,
    readonly dept: string,
    readonly kind: AgentKind,
    readonly emoji: string,
    readonly color: string,
    readonly desk: DeskPosition,
    readonly specialty: string,
    readonly systemPrompt: string,
    /** 소속 부서 (팀장의 id) */
    readonly team: TeamId,
    /** 부서 안에서의 역할 */
    readonly rank: AgentRank = 'lead',
  ) {}

  /** "박지우 리서치팀장" 같은 표시용 이름 */
  get displayName(): string {
    return `${this.name} ${this.title}`;
  }

  get isStaff(): boolean {
    return this.kind === 'staff';
  }

  /** 부서를 대표해 교차검토에 참여하는 팀장인지 */
  get isLead(): boolean {
    return this.rank === 'lead';
  }

  /** 클라이언트로 내보낼 안전한 형태 (systemPrompt 제외) */
  toPublic(): Agent {
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      dept: this.dept,
      kind: this.kind,
      emoji: this.emoji,
      color: this.color,
      desk: this.desk,
      specialty: this.specialty,
      team: this.team,
      rank: this.rank,
    };
  }
}
