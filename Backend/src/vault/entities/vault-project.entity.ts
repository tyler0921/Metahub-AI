import * as path from 'node:path';
import type { VaultProjectSummary } from '@shared';
import { formatLocalDate } from '../../common/utils/date.util';

/** 볼트 안의 프로젝트 폴더 하나 */
export class VaultProjectEntity {
  private constructor(
    readonly folderName: string,
    readonly absolutePath: string,
    readonly date: string,
    readonly title: string,
  ) {}

  /**
   * 대표 지시로부터 새 프로젝트 폴더를 만든다.
   * 폴더명: `2026-08-04 텀블러 브랜드 런칭`
   */
  static create(
    projectsDir: string,
    brief: string,
    now: Date = new Date(),
  ): VaultProjectEntity {
    const date = formatLocalDate(now);
    const title = VaultProjectEntity.slugify(brief) || '무제';
    const folderName = `${date} ${title}`;
    return new VaultProjectEntity(
      folderName,
      path.join(projectsDir, folderName),
      date,
      title,
    );
  }

  /** 이미 존재하는 폴더명으로부터 복원 */
  static fromFolderName(
    projectsDir: string,
    folderName: string,
  ): VaultProjectEntity {
    const match = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(folderName);
    return new VaultProjectEntity(
      folderName,
      path.join(projectsDir, folderName),
      match?.[1] ?? '',
      match?.[2] ?? folderName,
    );
  }

  get overviewPath(): string {
    return path.join(this.absolutePath, '00 개요.md');
  }

  get minutesPath(): string {
    return path.join(this.absolutePath, '01 회의록.md');
  }

  get deliverablePath(): string {
    return path.join(this.absolutePath, '산출물.md');
  }

  departmentNotePath(dept: string): string {
    return path.join(this.absolutePath, '부서', `${dept}.md`);
  }

  toSummary(): VaultProjectSummary {
    return { folder: this.folderName, title: this.title, date: this.date };
  }

  /** Obsidian 파일명으로 쓸 수 없는 문자를 제거 */
  private static slugify(text: string): string {
    return text
      .slice(0, 40)
      .replace(/[\\/:*?"<>|#^[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.,·\-\s]+$/, '');
  }
}
