/**
 * 대표님(플레이어) 전용 캐릭터 외형 생성기.
 *
 * `Frontend/tools/generate_sprites.mjs` 의 그리기 절차를 브라우저용으로
 * 옮긴 것입니다. `@napi-rs/canvas` 는 네이티브 Node 애드온이라 그 파일을
 * 브라우저 번들에 직접 import 할 수 없어서, 순수 그리기 로직만 브라우저
 * 캔버스 API 에 맞춰 다시 구성했습니다 — 원본 포즈를 고치면 여기도
 * 같이 맞춰야 합니다.
 *
 * 다른 8명 직원은 손으로 그린 원화(`character-directions-v3.png`)에서 잘라낸
 * 고정 스프라이트라 색 파라미터가 없습니다. 대표님만 이 절차적 생성기로 그려서
 * 셔츠·머리·피부색을 실시간으로 바꿀 수 있게 합니다.
 */

const CHAR_W = 32;
// generate_sprites.mjs 와 동일 — 발밑 그림자가 셀 아래쪽 경계에 닿지 않도록 2px 여유를 둡니다
const CHAR_H = 50;
const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
const FRAMES = 4;
/** 원화 캐릭터 셀 안에서 프레임마다 살짝 흔들리는 정렬 보정 — 원본과 동일 */
const FRAME_X = [0, -1, 0, 1] as const;
const FRAME_Y = [0, 1, 0, 1] as const;
const SWING_BY_FRAME: Record<number, number> = { 0: 0, 1: 2, 2: 0, 3: -2 };

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

type RGB = readonly [number, number, number];
type Fill = RGB | readonly number[] | string;

interface DrawPose {
  brush: PixelBrush;
  ox: number;
  oy: number;
  cx: number;
  shirt: RGB;
  hair: RGB;
  skin: RGB;
  direction: string;
  swing: number;
  facing: number;
  sideView: boolean;
  headTop: number;
  headBottom: number;
  halfW: number;
}

interface DrawCharacterParams {
  ctx: CanvasRenderingContext2D;
  ox: number;
  oy: number;
  shirt: RGB;
  hair: RGB;
  skin: RGB;
  direction: string;
  frame: number;
}

function hexChannel(hex: string, start: number): number {
  return Number.parseInt(hex.slice(start, start + 2), 16);
}

function hexRgb(value: string): RGB {
  const hex = value.replace('#', '');
  return [hexChannel(hex, 0), hexChannel(hex, 2), hexChannel(hex, 4)];
}

function shade(color: RGB, amount: number): RGB {
  return [
    Math.max(0, Math.min(255, color[0] + amount)),
    Math.max(0, Math.min(255, color[1] + amount)),
    Math.max(0, Math.min(255, color[2] + amount)),
  ];
}

function toFill(fill: Fill, alpha?: number): string {
  if (typeof fill === 'string') return fill;
  const [r, g, b, extra] = [...fill];
  const a = extra ?? alpha;
  if (a !== undefined) return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  return `rgb(${r}, ${g}, ${b})`;
}

/**  inclusive 좌표를 fillRect 에 맞게 그리는 얇은 래퍼 — 스프라이트 생성기와 호출 형태를 갈라 둡니다 */
class PixelBrush {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  rect(x0: number, y0: number, x1: number, y1: number, fill: Fill): void {
    this.ctx.fillStyle = toFill(fill);
    this.ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  stroke(x0: number, y0: number, x1: number, y1: number, fill: Fill, width = 1): void {
    this.ctx.strokeStyle = toFill(fill);
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(x0, y0);
    this.ctx.lineTo(x1, y1);
    this.ctx.stroke();
  }

  oval(x0: number, y0: number, x1: number, y1: number, fill: Fill): void {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    this.ctx.beginPath();
    this.ctx.ellipse(cx, cy, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, Math.PI * 2);
    this.ctx.fillStyle = toFill(fill);
    this.ctx.fill();
  }
}

const TROUSERS = hexRgb('#39404f');
const SHOES = hexRgb('#22262f');
const OUTLINE = hexRgb('#1a1d24');

function drawShadow(pose: DrawPose): void {
  pose.brush.oval(pose.cx - 8, pose.oy + 42, pose.cx + 8, pose.oy + 47, [0, 0, 0, 70]);
}

function drawSideLegs(pose: DrawPose): void {
  const { brush, cx, oy, swing, facing } = pose;
  for (const [depth, lift] of [
    [0, -swing],
    [1, swing],
  ]) {
    const lx = cx - 3 + depth * 2;
    const leg = depth ? TROUSERS : shade(TROUSERS, -18);
    brush.rect(lx, oy + 33, lx + 4, oy + 42 + lift, leg);
    const shoeLeft = facing < 0 ? lx - 2 : lx;
    const shoeRight = facing > 0 ? lx + 6 : lx + 4;
    brush.rect(
      shoeLeft,
      oy + 42 + lift,
      shoeRight,
      oy + 45 + lift,
      depth ? SHOES : shade(SHOES, -14),
    );
  }
}

function drawFrontLegs(pose: DrawPose): void {
  const { brush, cx, oy, swing } = pose;
  for (const sign of [-1, 1]) {
    const lift = sign < 0 ? swing : -swing;
    const lx = cx + sign * 4;
    brush.rect(lx - 3, oy + 33, lx + 2, oy + 42 + lift, TROUSERS);
    brush.rect(lx - 3, oy + 42 + lift, lx + 2, oy + 45 + lift, SHOES);
  }
}

function drawTorso(pose: DrawPose): void {
  const { brush, cx, oy, shirt, direction, halfW } = pose;
  const bodyTop = oy + 22;
  brush.rect(cx - halfW, bodyTop, cx + halfW - 1, oy + 35, shirt);
  brush.rect(cx - halfW, oy + 32, cx + halfW - 1, oy + 35, shade(shirt, -24));
  brush.rect(cx - halfW, bodyTop, cx + halfW - 1, bodyTop + 2, shade(shirt, 18));

  if (direction === 'down') {
    brush.rect(cx - 2, bodyTop, cx + 1, bodyTop + 3, shade(shirt, -30));
    return;
  }
  if (direction === 'up') {
    brush.stroke(cx, bodyTop + 1, cx, oy + 34, shade(shirt, -16));
  }
}

function drawSideArms(pose: DrawPose): void {
  const { brush, cx, oy, shirt, skin, swing, facing } = pose;
  const ax = cx + facing * 3;
  brush.rect(ax - 2, oy + 23, ax + 2, oy + 32 + swing, shade(shirt, -14));
  brush.rect(ax - 2, oy + 32 + swing, ax + 2, oy + 35 + swing, skin);
}

function drawFrontArms(pose: DrawPose): void {
  const { brush, cx, oy, shirt, skin, swing } = pose;
  for (const sign of [-1, 1]) {
    const offset = sign < 0 ? -swing : swing;
    const ax = cx + sign * 8;
    brush.rect(ax - 1, oy + 23, ax + 1, oy + 32 + offset, shade(shirt, -12));
    brush.rect(ax - 1, oy + 32 + offset, ax + 1, oy + 34 + offset, skin);
  }
}

function drawSideHead(pose: DrawPose): void {
  const { brush, cx, oy, hair, skin, facing, headTop, headBottom } = pose;
  const hx0 = cx - 5 + facing;
  const hx1 = cx + 5 + facing;
  brush.rect(hx0, headTop, hx1, headBottom, skin);
  brush.rect(hx0, headBottom - 2, hx1, headBottom, shade(skin, -18));
  const noseX = facing < 0 ? hx0 - 1 : hx1 + 1;
  brush.rect(noseX, oy + 15, noseX, oy + 17, shade(skin, -26));
  brush.rect(hx0, headTop - 1, hx1, headTop + 4, hair);
  if (facing < 0) {
    brush.rect(hx1 - 3, headTop - 1, hx1, oy + 19, hair);
  } else {
    brush.rect(hx0, headTop - 1, hx0 + 3, oy + 19, hair);
  }
  const earX = cx + (facing < 0 ? 2 : -3);
  brush.rect(earX, oy + 15, earX + 1, oy + 17, shade(skin, -22));
  const eyeX = facing < 0 ? hx0 + 1 : hx1 - 2;
  brush.rect(eyeX, oy + 15, eyeX + 1, oy + 17, OUTLINE);
}

function drawBackHead(pose: DrawPose): void {
  const { brush, cx, hair, headTop, headBottom } = pose;
  brush.rect(cx - 7, headTop - 1, cx + 6, headBottom, hair);
  brush.rect(cx - 7, headBottom - 2, cx + 6, headBottom, shade(hair, -18));
  brush.rect(cx - 5, headTop, cx + 4, headTop + 2, shade(hair, 22));
}

function drawFrontHead(pose: DrawPose): void {
  const { brush, cx, oy, hair, skin, headTop, headBottom } = pose;
  brush.rect(cx - 7, headTop, cx + 6, headBottom, skin);
  brush.rect(cx - 7, headBottom - 2, cx + 6, headBottom, shade(skin, -18));
  brush.rect(cx - 7, headTop - 1, cx + 6, headTop + 4, hair);
  brush.rect(cx - 7, headTop - 1, cx - 4, oy + 15, hair);
  brush.rect(cx + 3, headTop - 1, cx + 6, oy + 15, hair);
  brush.rect(cx - 5, oy + 15, cx - 4, oy + 17, OUTLINE);
  brush.rect(cx + 3, oy + 15, cx + 4, oy + 17, OUTLINE);
  brush.rect(cx - 1, oy + 18, cx, oy + 18, shade(skin, -40));
}

function drawHead(pose: DrawPose): void {
  if (pose.sideView) {
    drawSideHead(pose);
    return;
  }
  if (pose.direction === 'up') {
    drawBackHead(pose);
    return;
  }
  drawFrontHead(pose);
}

function drawCeoMark(pose: DrawPose): void {
  if (pose.direction !== 'down') return;
  const { brush, cx, oy } = pose;
  const bodyTop = oy + 22;
  brush.stroke(cx - 5, bodyTop + 2, cx - 1, bodyTop + 7, [232, 228, 216]);
  brush.stroke(cx + 4, bodyTop + 2, cx, bodyTop + 7, [232, 228, 216]);
}

/** `generate_sprites.mjs` 의 대표님(role='ceo') 포즈와 동일한 실루엣을 그립니다 */
function drawCharacter(params: DrawCharacterParams): void {
  const { ctx, ox, oy, shirt, hair, skin, direction, frame } = params;
  const sideView = direction === 'left' || direction === 'right';
  const pose: DrawPose = {
    brush: new PixelBrush(ctx),
    ox,
    oy,
    cx: ox + 16,
    shirt,
    hair,
    skin,
    direction,
    swing: SWING_BY_FRAME[frame] ?? 0,
    facing: direction === 'left' ? -1 : 1,
    sideView,
    headTop: oy + 7,
    headBottom: oy + 21,
    halfW: sideView ? 5 : 7,
  };

  drawShadow(pose);
  if (pose.sideView) {
    drawSideLegs(pose);
    drawTorso(pose);
    drawSideArms(pose);
  } else {
    drawFrontLegs(pose);
    drawTorso(pose);
    drawFrontArms(pose);
  }
  pose.brush.rect(pose.cx - 2, oy + 20, pose.cx + 1, oy + 23, shade(skin, -28));
  drawHead(pose);
  drawCeoMark(pose);
}

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
 * `build_reference_characters.mjs` 가 디자인팀(절차적 생성) 행을 손그림 원화와
 * 같은 셀 크기(frameWidth×frameHeight)로 맞추는 것과 동일한 중앙·바닥 정렬 스케일업입니다 —
 * 이렇게 해야 화면에서 다른 직원들과 크기가 어긋나지 않습니다.
 */
export function buildCustomCeoSheet(
  appearance: CustomAppearance,
  frameWidth: number,
  frameHeight: number,
): CustomCeoSheet {
  const shirt = hexRgb(appearance.shirt);
  const hair = hexRgb(appearance.hair);
  const skin = hexRgb(appearance.skin);

  const canvas = document.createElement('canvas');
  canvas.width = frameWidth * DIRECTIONS.length * FRAMES;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캐릭터 시트를 그릴 2D 캔버스 컨텍스트를 만들 수 없습니다.');

  const cell = document.createElement('canvas');
  cell.width = CHAR_W;
  cell.height = CHAR_H;
  const cellCtx = cell.getContext('2d');
  if (!cellCtx) throw new Error('캐릭터 셀 캔버스 컨텍스트를 만들 수 없습니다.');

  const scale = Math.min((frameWidth - 4) / CHAR_W, (frameHeight - 4) / CHAR_H);
  const width = Math.max(1, Math.round(CHAR_W * scale));
  const height = Math.max(1, Math.round(CHAR_H * scale));

  for (let d = 0; d < DIRECTIONS.length; d++) {
    const direction = DIRECTIONS[d];
    for (let frame = 0; frame < FRAMES; frame++) {
      cellCtx.clearRect(0, 0, CHAR_W, CHAR_H);
      drawCharacter({ ctx: cellCtx, ox: 0, oy: 0, shirt, hair, skin, direction, frame });

      const col = d * FRAMES + frame;
      const cellX = col * frameWidth;
      const dx = cellX + Math.floor((frameWidth - width) / 2) + FRAME_X[frame];
      const dy = frameHeight - height - 2 + FRAME_Y[frame];
      ctx.drawImage(cell, 0, 0, CHAR_W, CHAR_H, dx, dy, width, height);
    }
  }

  return { canvas, frameWidth, frameHeight, frames: FRAMES, directions: DIRECTIONS };
}
