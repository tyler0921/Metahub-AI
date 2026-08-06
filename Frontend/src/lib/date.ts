/** 상단바 등에 쓰는 "8월 5일 (수)" 형식 */
export function formatTodayLabel(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

/** ISO 로컬 날짜 `YYYY-MM-DD` */
export function formatLocalDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
