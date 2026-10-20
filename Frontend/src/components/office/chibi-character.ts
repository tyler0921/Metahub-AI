/**
 * 치비(2등신) 픽셀 캐릭터 한 포즈를 그립니다.
 *
 * 스프라이트 생성기(`tools/generate_sprites.mjs`, Node 가 타입을 지우고 실행)와
 * 대표님 외형 커스터마이징(`custom-character.ts`, 브라우저)이 **같은 이 파일**을 씁니다.
 * 그래서 Node 의 타입 지우기로 실행 가능한 문법만 씁니다 — enum·namespace·
 * 생성자 매개변수 프로퍼티는 쓰지 마세요.
 *
 * 칸 크기 32×50, 발바닥은 y=45. 머리(약 24px)가 몸의 절반을 차지하는 시안 비율입니다.
 */

export const CHIBI_W = 32;
export const CHIBI_H = 50;
export const CHIBI_DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export const CHIBI_FRAMES = 4;

/**
 * 시트의 행 순서와 역할별 색 — 스프라이트 생성기와 헤더 얼굴 아바타가 같은 순서를 씁니다.
 * 시트 해상도(SHEET_RES)도 생성기와 맞춰 둡니다.
 */
export const CHIBI_ROSTER = [
  { id: 'ceo', shirt: '#26354a', hair: '#252a35', skin: '#f2cba3' },
  { id: 'chief', shirt: '#d99b2b', hair: '#6f4128', skin: '#f0c9a0' },
  { id: 'planner', shirt: '#367cae', hair: '#252a35', skin: '#e8bd94' },
  { id: 'researcher', shirt: '#8056a8', hair: '#35283d', skin: '#f3d0ab' },
  { id: 'marketer', shirt: '#d66767', hair: '#7b3f32', skin: '#f0c9a0' },
  { id: 'dev', shirt: '#178f88', hair: '#242936', skin: '#e0b088' },
  { id: 'finance', shirt: '#31577f', hair: '#273247', skin: '#f2cba3' },
  { id: 'writer', shirt: '#d8802f', hair: '#6d4329', skin: '#f5d5b0' },
  { id: 'designer', shirt: '#c9578b', hair: '#3a2a20', skin: '#f0c9a0' },
] as const;
export const CHIBI_SHEET_RES = 2;

export type Rgb = readonly [number, number, number];
type Fill = Rgb | readonly [number, number, number, number] | string;

/** Node(@napi-rs/canvas)와 브라우저 캔버스가 공통으로 가진 부분만 씁니다 */
type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'ellipse'
  | 'roundRect'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
>;

export function hexRgb(value: string): Rgb {
  const hex = value.replace('#', '');
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

export function shade(color: Rgb, amount: number): Rgb {
  return [
    Math.max(0, Math.min(255, color[0] + amount)),
    Math.max(0, Math.min(255, color[1] + amount)),
    Math.max(0, Math.min(255, color[2] + amount)),
  ];
}

function toFill(fill: Fill): string {
  if (typeof fill === 'string') return fill;
  const [r, g, b, a] = fill as readonly number[];
  return a === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

const OUTLINE: Fill = [28, 26, 44];
const EYE: Fill = [36, 30, 58];
const PANTS = hexRgb('#2f3a5c');
const SHOES = hexRgb('#1d2234');
const BLUSH: Fill = [244, 140, 150, 150];
const WHITE: Fill = [255, 255, 255];

/** inclusive 좌표 사각형 — 픽셀 단위로 맞춰 그립니다 */
function px(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, fill: Fill): void {
  ctx.fillStyle = toFill(fill);
  ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

function round(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, fill: Fill): void {
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1, r);
  ctx.fillStyle = toFill(fill);
  ctx.fill();
}

/** 1px 짙은 테두리를 두른 둥근 사각형 — 밝은 바닥 위에서도 실루엣이 또렷합니다 */
function outlined(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, fill: Fill): void {
  round(ctx, x0 - 1, y0 - 1, x1 + 1, y1 + 1, r + 1, OUTLINE);
  round(ctx, x0, y0, x1, y1, r, fill);
}

function oval(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, fill: Fill): void {
  ctx.beginPath();
  ctx.ellipse((x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2, (x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = toFill(fill);
  ctx.fill();
}

interface Pose {
  ctx: Ctx;
  ox: number;
  /** 걷는 중 몸이 살짝 뜨는 만큼 (머리·몸통·팔에 적용) */
  oy: number;
  /** 발은 땅에 붙어 있으므로 bob 이 없는 원래 y */
  groundY: number;
  shirt: Rgb;
  hair: Rgb;
  skin: Rgb;
  swing: number;
  role: string;
}

// ── 앞모습 ───────────────────────────────────────────────
function frontLegs(p: Pose): void {
  const { ctx, ox, groundY: g, swing } = p;
  for (const [x0, lift] of [
    [11, swing > 0 ? -1 : 0],
    [17, swing < 0 ? -1 : 0],
  ] as const) {
    px(ctx, ox + x0 - 1, g + 36 + lift, ox + x0 + 4, g + 44 + lift, OUTLINE);
    px(ctx, ox + x0, g + 36 + lift, ox + x0 + 3, g + 42 + lift, PANTS);
    px(ctx, ox + x0, g + 42 + lift, ox + x0 + 3, g + 43 + lift, SHOES);
  }
}

function frontBody(p: Pose): void {
  const { ctx, ox, oy, shirt, skin, swing } = p;
  // 팔 — 걸을 때 앞뒤로 흔듭니다
  for (const [x0, dy] of [
    [6, -swing],
    [23, swing],
  ] as const) {
    outlined(ctx, ox + x0, oy + 27 + dy, ox + x0 + 2, oy + 35 + dy, 1, shade(shirt, -14));
    px(ctx, ox + x0, oy + 34 + dy, ox + x0 + 2, oy + 36 + dy, skin);
  }
  outlined(ctx, ox + 9, oy + 26, ox + 22, oy + 38, 3, shirt);
  px(ctx, ox + 10, oy + 27, ox + 21, oy + 27, shade(shirt, 22));
  px(ctx, ox + 9, oy + 36, ox + 22, oy + 38, shade(shirt, -24));
  // 옷깃
  ctx.beginPath();
  ctx.moveTo(ox + 12.5, oy + 26);
  ctx.lineTo(ox + 19.5, oy + 26);
  ctx.lineTo(ox + 16, oy + 30);
  ctx.closePath();
  ctx.fillStyle = toFill(shade(shirt, 48));
  ctx.fill();
}

function frontHead(p: Pose): void {
  const { ctx, ox, oy, hair, skin } = p;
  // 머리 전체 실루엣(머리카락) → 얼굴 → 앞머리 순으로 덮습니다
  outlined(ctx, ox + 5, oy + 5, ox + 26, oy + 27, 10, hair);
  round(ctx, ox + 8, oy + 11, ox + 23, oy + 27, 7, skin);
  px(ctx, ox + 9, oy + 26, ox + 22, oy + 27, shade(skin, -16));
  // 앞머리 — 끝이 들쭉날쭉해야 머리카락으로 읽힙니다
  px(ctx, ox + 7, oy + 9, ox + 24, oy + 12, hair);
  px(ctx, ox + 8, oy + 13, ox + 10, oy + 14, hair);
  px(ctx, ox + 13, oy + 13, ox + 16, oy + 13, hair);
  px(ctx, ox + 20, oy + 13, ox + 23, oy + 14, hair);
  // 옆머리
  px(ctx, ox + 6, oy + 12, ox + 8, oy + 21, hair);
  px(ctx, ox + 23, oy + 12, ox + 25, oy + 21, hair);
  // 머리 윤기
  px(ctx, ox + 10, oy + 7, ox + 15, oy + 7, shade(hair, 34));
  px(ctx, ox + 9, oy + 8, ox + 11, oy + 8, shade(hair, 34));
  // 눈 — 3×4 큰 눈 + 하이라이트
  for (const x0 of [10, 19]) {
    px(ctx, ox + x0, oy + 16, ox + x0 + 2, oy + 19, EYE);
    px(ctx, ox + x0, oy + 16, ox + x0, oy + 16, WHITE);
  }
  px(ctx, ox + 8, oy + 21, ox + 10, oy + 22, BLUSH);
  px(ctx, ox + 21, oy + 21, ox + 23, oy + 22, BLUSH);
  px(ctx, ox + 15, oy + 23, ox + 16, oy + 23, shade(skin, -72));
}

// ── 옆모습 (오른쪽 기준 — 왼쪽은 좌우 반전) ─────────────────
function sideLegs(p: Pose): void {
  const { ctx, ox, groundY: g, swing } = p;
  for (const [dx, tone] of [
    [-swing, -18],
    [swing, 0],
  ] as const) {
    const x0 = ox + 13 + dx;
    px(ctx, x0 - 1, g + 36, x0 + 5, g + 44, OUTLINE);
    px(ctx, x0, g + 36, x0 + 4, g + 42, shade(PANTS, tone));
    px(ctx, x0, g + 42, x0 + 5, g + 43, shade(SHOES, tone));
  }
}

function sideBody(p: Pose): void {
  const { ctx, ox, oy, shirt, skin, swing } = p;
  outlined(ctx, ox + 11, oy + 26, ox + 20, oy + 38, 3, shirt);
  px(ctx, ox + 12, oy + 27, ox + 19, oy + 27, shade(shirt, 22));
  px(ctx, ox + 11, oy + 36, ox + 20, oy + 38, shade(shirt, -24));
  outlined(ctx, ox + 14 + swing, oy + 28, ox + 16 + swing, oy + 35, 1, shade(shirt, -14));
  px(ctx, ox + 14 + swing, oy + 34, ox + 16 + swing, oy + 36, skin);
}

function sideHead(p: Pose): void {
  const { ctx, ox, oy, hair, skin } = p;
  outlined(ctx, ox + 5, oy + 5, ox + 26, oy + 27, 10, hair);
  round(ctx, ox + 12, oy + 11, ox + 25, oy + 27, 7, skin);
  px(ctx, ox + 13, oy + 26, ox + 24, oy + 27, shade(skin, -16));
  px(ctx, ox + 11, oy + 9, ox + 25, oy + 12, hair);
  px(ctx, ox + 17, oy + 13, ox + 19, oy + 13, hair);
  px(ctx, ox + 22, oy + 13, ox + 25, oy + 14, hair);
  // 뒷머리가 귀 뒤까지 덮습니다
  px(ctx, ox + 6, oy + 11, ox + 13, oy + 24, hair);
  px(ctx, ox + 12, oy + 17, ox + 13, oy + 19, shade(skin, -20));
  px(ctx, ox + 10, oy + 7, ox + 15, oy + 7, shade(hair, 34));
  px(ctx, ox + 20, oy + 16, ox + 22, oy + 19, EYE);
  px(ctx, ox + 20, oy + 16, ox + 20, oy + 16, WHITE);
  px(ctx, ox + 21, oy + 21, ox + 23, oy + 22, BLUSH);
}

// ── 뒷모습 ───────────────────────────────────────────────
function backBody(p: Pose): void {
  const { ctx, ox, oy, shirt, skin, swing } = p;
  for (const [x0, dy] of [
    [6, swing],
    [23, -swing],
  ] as const) {
    outlined(ctx, ox + x0, oy + 27 + dy, ox + x0 + 2, oy + 35 + dy, 1, shade(shirt, -14));
    px(ctx, ox + x0, oy + 34 + dy, ox + x0 + 2, oy + 36 + dy, skin);
  }
  outlined(ctx, ox + 9, oy + 26, ox + 22, oy + 38, 3, shirt);
  px(ctx, ox + 9, oy + 36, ox + 22, oy + 38, shade(shirt, -24));
  px(ctx, ox + 15, oy + 28, ox + 16, oy + 37, shade(shirt, -14));
}

function backHead(p: Pose): void {
  const { ctx, ox, oy, hair } = p;
  outlined(ctx, ox + 5, oy + 5, ox + 26, oy + 27, 10, hair);
  px(ctx, ox + 8, oy + 24, ox + 23, oy + 27, shade(hair, -16));
  px(ctx, ox + 10, oy + 8, ox + 21, oy + 9, shade(hair, 30));
  px(ctx, ox + 12, oy + 10, ox + 19, oy + 10, shade(hair, 18));
}

// ── 역할 표식 — 색만으로 직원을 구분하지 않도록 실루엣이 다른 소품을 둡니다 ──
function roleMark(p: Pose, view: 'front' | 'side' | 'back'): void {
  const { ctx, ox, oy, role, hair, shirt } = p;
  if (role === 'writer') {
    // 올림머리
    // 걸을 때 몸이 1px 뜨므로 칸 위 경계에서 2px 띄웁니다
    oval(ctx, ox + 17, oy + 2, ox + 24, oy + 8, OUTLINE);
    oval(ctx, ox + 18, oy + 3, ox + 23, oy + 7, hair);
    px(ctx, ox + 19, oy + 7, ox + 22, oy + 7, [217, 155, 43]);
  }
  if (role === 'designer') {
    // 베레모
    oval(ctx, ox + 6, oy + 2, ox + 21, oy + 9, OUTLINE);
    oval(ctx, ox + 7, oy + 3, ox + 20, oy + 8, shade(shirt, -36));
    px(ctx, ox + 13, oy + 2, ox + 14, oy + 2, shade(shirt, -50));
  }
  if (view === 'back') return;

  if (role === 'marketer') {
    // 헤드셋
    px(ctx, ox + 5, oy + 13, ox + 6, oy + 20, OUTLINE);
    if (view === 'front') px(ctx, ox + 25, oy + 13, ox + 26, oy + 20, OUTLINE);
    const micX = view === 'front' ? 23 : 24;
    ctx.strokeStyle = toFill(OUTLINE);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + micX + 2.5, oy + 20);
    ctx.lineTo(ox + micX - 2, oy + 24);
    ctx.stroke();
  }
  if (role === 'researcher' || role === 'dev') {
    const frame: Fill = role === 'researcher' ? [119, 76, 163] : [23, 120, 116];
    ctx.strokeStyle = toFill(frame);
    ctx.lineWidth = 1;
    if (view === 'front') {
      ctx.strokeRect(ox + 8.5, oy + 15.5, 6, 5);
      ctx.strokeRect(ox + 17.5, oy + 15.5, 6, 5);
      px(ctx, ox + 15, oy + 17, ox + 16, oy + 17, frame);
    } else {
      ctx.strokeRect(ox + 18.5, oy + 15.5, 6, 5);
      px(ctx, ox + 12, oy + 17, ox + 18, oy + 17, frame);
    }
  }
  if (view !== 'front') return;

  if (role === 'ceo') {
    // 흰 셔츠 V 깃 + 보라 넥타이
    ctx.beginPath();
    ctx.moveTo(ox + 12.5, oy + 26);
    ctx.lineTo(ox + 19.5, oy + 26);
    ctx.lineTo(ox + 16, oy + 32);
    ctx.closePath();
    ctx.fillStyle = toFill([240, 238, 248]);
    ctx.fill();
    px(ctx, ox + 15, oy + 27, ox + 16, oy + 33, [99, 82, 245]);
  }
  if (role === 'finance') {
    px(ctx, ox + 15, oy + 27, ox + 16, oy + 33, [215, 157, 63]);
  }
  if (role === 'dev') {
    // 후드 끈
    px(ctx, ox + 13, oy + 28, ox + 13, oy + 32, shade(shirt, 50));
    px(ctx, ox + 18, oy + 28, ox + 18, oy + 32, shade(shirt, 50));
  }
}

export interface ChibiLook {
  shirt: Rgb;
  hair: Rgb;
  skin: Rgb;
  /** 역할 표식(안경·헤드셋·넥타이 등) — 없으면 표식 없이 그립니다 */
  role?: string;
}

/**
 * (ox, oy) 를 왼쪽 위로 하는 32×50 칸에 한 포즈를 그립니다.
 * frame 0·2 는 두 발이 땅에 닿은 자세, 1·3 은 다리가 엇갈리며 몸이 1px 뜬 자세입니다.
 */
export function drawChibi(
  ctx: Ctx,
  ox: number,
  oy: number,
  look: ChibiLook,
  direction: string,
  frame: number,
): void {
  const swing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
  const pose: Pose = {
    ctx,
    ox,
    oy: oy - (swing === 0 ? 0 : 1),
    groundY: oy,
    shirt: look.shirt,
    hair: look.hair,
    skin: look.skin,
    swing,
    role: look.role ?? '',
  };

  // 발밑 그림자는 렌더러가 따로 깔지만, 시트만 봐도 서 있는 위치가 보이게 옅게 둡니다
  oval(ctx, ox + 8, oy + 42, ox + 23, oy + 46, [0, 0, 0, 45]);

  if (direction === 'left' || direction === 'right') {
    ctx.save();
    if (direction === 'left') {
      // 오른쪽 모습을 칸 안에서 좌우로 뒤집습니다
      ctx.translate(ox * 2 + CHIBI_W, 0);
      ctx.scale(-1, 1);
    }
    sideLegs(pose);
    sideBody(pose);
    sideHead(pose);
    roleMark(pose, 'side');
    ctx.restore();
    return;
  }

  frontLegs(pose);
  if (direction === 'up') {
    backBody(pose);
    backHead(pose);
    roleMark(pose, 'back');
    return;
  }
  frontBody(pose);
  frontHead(pose);
  roleMark(pose, 'front');
}
