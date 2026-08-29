/** 볼트에 저장된 마크다운 노트 1건 */
export class VaultNoteEntity {
  constructor(
    /** 볼트 루트 기준 상대 경로 (예: `AI Company/프로젝트/.../산출물.md`) */
    readonly relativePath: string,
    readonly title: string,
    readonly content: string,
    readonly modifiedAt: Date,
  ) {}

  /** 프론트에 보여줄 라벨 — `프로젝트 폴더 › 노트명` */
  get label(): string {
    const segments = this.relativePath.split('/');
    const parent = segments.at(-2);
    const grandParent = segments.at(-3);
    // 부서 노트는 한 단계 더 올라가야 프로젝트명이 나온다
    const project = parent === '부서' ? grandParent : parent;
    return project ? `${project} › ${this.title}` : this.title;
  }

  /**
   * frontmatter 를 걷어낸 본문.
   *
   * 줄바꿈을 `\n` 으로 못 박으면 Windows 에서 손댄 노트(CRLF)는 닫는 `---` 를
   * 못 찾고, frontmatter 가 통째로 본문에 남아 검색어와 길이를 오염시킵니다.
   * 여는 줄을 함께 고정해 문서 중간의 수평선(`---`)까지 잘라내지 않게 합니다.
   */
  get body(): string {
    return this.content.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/, '').trim();
  }

  /**
   * frontmatter 의 `type` 필드.
   *
   * 노트를 쓸 때 `NoteFormatter` 가 넣어둔 값입니다. 지금까지는 저장만 하고
   * 읽지 않았는데, 회상에서 **어떤 종류의 노트를 볼지** 고르는 데 씁니다.
   * 파싱 실패(수동 작성 노트 등)는 null 이고, 그런 노트는 걸러내지 않습니다.
   */
  get type(): string | null {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(this.content);
    if (!match) return null;
    return /^type:\s*(.+)$/m.exec(match[1])?.[1]?.trim() ?? null;
  }

  /**
   * 회상에서 빼야 하는 노트인가.
   *
   * - 회의록: 부서 간 대화 원문. 같은 내용이 산출물에 정제돼 다시 들어 있어서
   *   둘 다 넣으면 컨텍스트만 두 배가 됩니다.
   * - 인덱스: 프로젝트 제목 목록뿐이라 어떤 검색어에도 조금씩 걸리는데,
   *   짧아서 길이 정규화의 이득까지 봐 거의 항상 1등으로 올라옵니다.
   *   정작 읽을 내용은 한 줄도 없습니다.
   */
  get excludedFromRecall(): boolean {
    return this.type === 'ai-company-minutes' || this.type === 'ai-company-index';
  }

  /** 검색용 본문 길이 (frontmatter 제외) */
  get bodyLength(): number {
    return this.body.length;
  }
}
