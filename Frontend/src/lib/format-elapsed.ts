/** 경과 초를 상태 알약·요약에 쓰는 짧은 한국어 형식으로 바꿉니다. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes}분 ${rest}초` : `${minutes}분`;
}
