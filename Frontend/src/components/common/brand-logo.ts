/**
 * MetaHub 로고 모양 — 둥근 아치 두 개가 이어진 "M" 과 가운데 골짜기의 반짝임.
 *
 * 헤더 SVG(BrandLogo)와 오피스 캔버스의 로비 간판(Path2D)이 같은 좌표를 씁니다.
 * 좌표계는 viewBox 0 0 40 30 입니다.
 */
export const LOGO_VIEWBOX = { width: 40, height: 30 } as const;

/** 굵은 선(LOGO_STROKE)으로 그리는 M — 가운데 다리는 짧게 끊어 아치 두 개로 읽히게 합니다 */
export const LOGO_ARCH_PATH = 'M6 25V13a7 7 0 0 1 14 0v6M20 13a7 7 0 0 1 14 0v12';
export const LOGO_STROKE = 7.5;

/** 두 아치가 만나는 골짜기 위의 네 꼭짓점 반짝임 */
export const LOGO_SPARK_PATH = 'M20 8.6l1.15 2.6 2.6 1.15-2.6 1.15L20 16.1l-1.15-2.6-2.6-1.15 2.6-1.15z';

/** 왼쪽 파랑 → 오른쪽 보라 */
export const LOGO_GRADIENT = ['#4f74ff', '#8b5cff'] as const;
