const DEFAULT_TIME_ZONE = 'Asia/Seoul';

/** 앱에서 쓰는 타임존 (`.env` 의 `APP_TIMEZONE`, 기본: 서울) */
export function getAppTimeZone(): string {
  return process.env.APP_TIMEZONE?.trim() || DEFAULT_TIME_ZONE;
}

/**
 * 로컬(또는 설정된 타임존) 기준 `YYYY-MM-DD`.
 *
 * `toISOString()` 은 UTC 기준이라 한국 새벽 시간대에 하루가 밀릴 수 있습니다.
 */
export function formatLocalDate(now: Date = new Date(), timeZone?: string): string {
  const tz = timeZone ?? getAppTimeZone();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `HH:mm:ss` (24시간) */
export function formatLocalTime(now: Date = new Date(), timeZone?: string): string {
  const tz = timeZone ?? getAppTimeZone();
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
}

/** 한국어 날짜·시간 라벨 */
export function formatLocalDateTimeLabel(now: Date = new Date(), timeZone?: string): string {
  const tz = timeZone ?? getAppTimeZone();
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(now);
}

/** LLM 프롬프트에 붙이는 "오늘" 컨텍스트 */
export function buildDateContext(now: Date = new Date()): string {
  const tz = getAppTimeZone();
  const date = formatLocalDate(now, tz);
  const label = formatLocalDateTimeLabel(now, tz);

  return [
    '## 현재 일시',
    `- 오늘 날짜: ${date}`,
    `- 현재 시각: ${label} (${tz})`,
    '- 문서·보고서·일정에 날짜를 적을 때는 반드시 위 날짜를 사용하세요.',
    '- 학습 데이터에 있는 과거 날짜(예: 2023년)를 현재 날짜 대신 쓰지 마세요.',
  ].join('\n');
}
