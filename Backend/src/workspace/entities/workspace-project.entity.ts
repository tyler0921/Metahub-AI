import * as path from 'node:path';
import { formatLocalDate } from '../../common/utils/date.util';

/**
 * 코드형 산출물이 담기는 폴더 하나.
 *
 * 볼트의 `VaultProjectEntity` 와 역할은 같지만 규칙이 다릅니다.
 * 이쪽 폴더명은 **URL 의 일부가 되므로** 공백·한글을 쓰지 않고
 * 영숫자와 하이픈으로만 만듭니다.
 */
export class WorkspaceProjectEntity {
  private constructor(
    readonly folderName: string,
    readonly absolutePath: string,
  ) {}

  /**
   * 대표 지시로부터 새 폴더를 만든다.
   * 폴더명: `20260806-143012-landing-page`
   *
   * 시각까지 넣는 이유는 같은 지시를 두 번 내렸을 때 이전 결과를
   * 덮어쓰지 않기 위해서입니다.
   */
  static create(
    root: string,
    brief: string,
    now: Date = new Date(),
  ): WorkspaceProjectEntity {
    const stamp =
      formatLocalDate(now).replace(/-/g, '') +
      '-' +
      [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((n) => String(n).padStart(2, '0'))
        .join('');

    const slug = WorkspaceProjectEntity.slugify(brief);
    const folderName = slug ? `${stamp}-${slug}` : stamp;

    return new WorkspaceProjectEntity(folderName, path.join(root, folderName));
  }

  filePath(relativePath: string): string {
    return path.join(this.absolutePath, relativePath);
  }

  /**
   * URL 에 그대로 넣어도 안전한 이름으로 줄인다.
   *
   * 한글 지시가 대부분이라 슬러그가 통째로 비는 경우가 흔합니다.
   * 그때는 빈 문자열을 돌려주고 호출자가 타임스탬프만 쓰게 둡니다.
   */
  private static slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
      .replace(/-+$/, '');
  }
}
