/**
 * 런타임 설정 — 환경변수를 읽는 곳은 여기 한 군데뿐입니다.
 * 다른 파일에서 `import.meta.env` 를 직접 만지지 마세요.
 */

/**
 * API 베이스 주소.
 * 비어 있으면 상대 경로(`/api`)를 쓰고 Vite 프록시가 백엔드로 넘깁니다.
 * 배포 시에는 리버스 프록시가 같은 역할을 합니다.
 */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ?? ''
).replace(/\/$/, '');

export const IS_DEV: boolean = import.meta.env.DEV;
