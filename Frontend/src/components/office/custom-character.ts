/**
 * 대표님(플레이어) 전용 캐릭터 외형 생성기.
 *
 * 그리기는 스프라이트 생성기와 같은 `chibi-character.ts` 를 그대로 씁니다 —
 * 공용 시트의 대표님과 커스텀 대표님이 같은 그림이라, 색만 바뀌고 모양은 어긋나지 않습니다.
 * 대표님만 셔츠·머리·피부색을 실시간으로 바꿀 수 있게 브라우저에서 시트를 다시 그립니다.
 */
import {
  CHIBI_DIRECTIONS,
  CHIBI_FRAMES,
  CHIBI_H,
  CHIBI_W,
  drawChibi,
  hexRgb,
} from './chibi-character';

export interface CustomAppearance {
  shirt: string;
  hair: string;
  skin: string;
}

export const DEFAULT_APPEARANCE: CustomAppearance = {
  shirt: '#26354a',
  hair: '#252a35',
  skin: '#f2cba3',
};

/** 자유 색상(input type=color)인 셔츠와 달리, 머리·피부는 픽셀아트 조화를 위해 고른 스와치만 씁니다 */
export const HAIR_SWATCHES: readonly string[] = [
  '#252a35', '#3a2a20', '#6d4329', '#7b3f32', '#c9b48f', '#9aa0a8', '#35283d',
];
export const SKIN_SWATCHES: readonly string[] = [
  '#f5d5b0', '#f2cba3', '#e8bd94', '#e0b088', '#c48958', '#8a5a35',
];

const STORAGE_KEY = 'metahub-ceo-appearance';

function isValidAppearance(value: unknown): value is CustomAppearance {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.shirt === 'string' && typeof v.hair === 'string' && typeof v.skin === 'string';
}

/** 계정 개념이 없는 앱이라 다른 UI 설정(가이드 표시 여부 등)과 같은 방식으로 로컬에 저장합니다 */
export function loadStoredAppearance(): CustomAppearance {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed: unknown = JSON.parse(raw);
    return isValidAppearance(parsed) ? parsed : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveStoredAppearance(appearance: CustomAppearance): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // 저장 실패(프라이빗 모드 등)해도 이번 세션 내 외형 적용에는 지장이 없습니다
  }
}

export interface CustomCeoSheet {
  canvas: HTMLCanvasElement;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  directions: readonly string[];
}

/**
 * 4방향×4프레임(16칸) 캐릭터 시트를 그려 넣습니다.
 * 공용 시트의 칸 크기(2배 해상도)에 맞춰 가운데·바닥 정렬로 확대해 그립니다.
 */
export function buildCustomCeoSheet(
  appearance: CustomAppearance,
  frameWidth: number,
  frameHeight: number,
): CustomCeoSheet {
  const look = {
    shirt: hexRgb(appearance.shirt),
    hair: hexRgb(appearance.hair),
    skin: hexRgb(appearance.skin),
    role: 'ceo',
  };

  const canvas = document.createElement('canvas');
  canvas.width = frameWidth * CHIBI_DIRECTIONS.length * CHIBI_FRAMES;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캐릭터 시트를 그릴 2D 캔버스 컨텍스트를 만들 수 없습니다.');

  // 공용 시트처럼 칸 해상도에 맞춰 벡터로 바로 그립니다 — 작은 칸을 키워 붙이면 계단이 생깁니다
  const scale = Math.min(frameWidth / CHIBI_W, frameHeight / CHIBI_H);
  const offsetX = Math.floor((frameWidth - CHIBI_W * scale) / 2);
  const offsetY = frameHeight - CHIBI_H * scale;

  CHIBI_DIRECTIONS.forEach((direction, d) => {
    for (let frame = 0; frame < CHIBI_FRAMES; frame++) {
      ctx.save();
      ctx.translate((d * CHIBI_FRAMES + frame) * frameWidth + offsetX, offsetY);
      ctx.scale(scale, scale);
      drawChibi(ctx, 0, 0, look, direction, frame);
      ctx.restore();
    }
  });

  return { canvas, frameWidth, frameHeight, frames: CHIBI_FRAMES, directions: CHIBI_DIRECTIONS };
}
