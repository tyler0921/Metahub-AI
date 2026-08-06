import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { AgentId, TeamId } from '@shared';
import { AGENT_SEED, OFFICE_SEED } from './data/agents.seed';
import { AgentEntity } from './entities/agent.entity';
import { OfficeMapEntity } from './entities/office-map.entity';

/**
 * AI 직원 조회 서비스.
 * 지금은 시드 데이터를 메모리에 들고 있지만, 이 서비스의 인터페이스만 유지하면
 * 나중에 DB(TypeORM Repository)로 바꿔도 다른 모듈은 영향을 받지 않습니다.
 */
@Injectable()
export class AgentsService implements OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);

  private readonly registry = new Map<AgentId, AgentEntity>();
  private readonly office: OfficeMapEntity = OFFICE_SEED;

  onModuleInit(): void {
    for (const agent of AGENT_SEED) {
      if (!this.office.contains(agent.desk)) {
        // 좌석은 프론트 도면이 최종 결정하므로 부팅을 막지는 않습니다
        this.logger.warn(
          `${agent.displayName} 의 좌석(${agent.desk.x}, ${agent.desk.y})이 오피스 범위 밖입니다.`,
        );
      }
      this.registry.set(agent.id, agent);
    }
  }

  findAll(): AgentEntity[] {
    return [...this.registry.values()];
  }

  findById(id: AgentId): AgentEntity {
    const agent = this.registry.get(id);
    if (!agent) throw new NotFoundException(`직원을 찾을 수 없습니다: ${id}`);
    return agent;
  }

  /** 존재 여부만 확인 (LLM 이 만들어낸 잘못된 부서 id 를 걸러낼 때 사용) */
  exists(id: string): id is AgentId {
    return this.registry.has(id as AgentId);
  }

  /** 실무 부서 (총괄·문서팀 제외) */
  findStaff(): AgentEntity[] {
    return this.findAll().filter((a) => a.isStaff);
  }

  /**
   * 부서를 대표하는 팀장만. 비서실장이 업무를 배정할 때,
   * 그리고 교차검토에 참여할 때 쓰는 목록입니다.
   * (팀원까지 교차검토에 넣으면 검토 조합이 n×(n-1) 로 폭발합니다)
   */
  findAssignableLeads(): AgentEntity[] {
    return this.findAll().filter((a) => a.isLead && a.isStaff);
  }

  /** 같은 부서의 팀원 (팀장 제외) */
  findTeammates(team: TeamId): AgentEntity[] {
    return this.findAll().filter((a) => a.team === team && !a.isLead);
  }

  /** 팀장 + 팀원 전체 */
  findTeam(team: TeamId): AgentEntity[] {
    return this.findAll().filter((a) => a.team === team);
  }

  get chief(): AgentEntity {
    return this.findById('chief');
  }

  get writer(): AgentEntity {
    return this.findById('writer');
  }

  getOffice(): OfficeMapEntity {
    return this.office;
  }
}
