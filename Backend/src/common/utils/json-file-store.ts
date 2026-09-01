import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * `path`가 없거나(ENOENT) 파싱에 실패하면 `fallback`을 반환합니다.
 * ENOENT가 아닌 오류는 `onError`로 전달되어 호출부가 로깅할 수 있습니다.
 */
export function readJsonFileOrDefault<T>(path: string, fallback: T, onError?: (error: unknown) => void): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') onError?.(error);
    return fallback;
  }
}

/** 임시 파일에 쓴 뒤 rename하여 쓰기 도중 크래시가 나도 기존 파일이 손상되지 않게 합니다 */
export function writeJsonFileAtomic(path: string, data: unknown, pretty = true): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  const content = pretty ? `${JSON.stringify(data, null, 2)}\n` : JSON.stringify(data);
  writeFileSync(tempPath, content, 'utf8');
  renameSync(tempPath, path);
}
