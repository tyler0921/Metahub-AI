/** 산출물 파일 크기를 바이트/킬로바이트로 짧게 표시합니다. */
export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
