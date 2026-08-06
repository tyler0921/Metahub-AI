/**
 * 스프라이트 로더.
 *
 * `Frontend/tools/generate_sprites.py` 가 만든 PNG 3장과 좌표 매니페스트를 읽어들입니다.
 * 에셋을 다시 그리고 싶으면 그 파이썬 스크립트를 고치고 다시 실행하세요.
 */

export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteManifest {
  characters: {
    frameWidth: number;
    frameHeight: number;
    directions: string[];
    frames: number;
    rows: Record<string, number>;
  };
  tileSize: number;
  tiles: Record<string, SpriteRect>;
  props: Record<string, SpriteRect>;
}

export interface SpriteAssets {
  characters: HTMLImageElement;
  tiles: HTMLImageElement;
  props: HTMLImageElement;
  manifest: SpriteManifest;
  /** 카펫을 방 색으로 물들인 캔버스 캐시 */
  tintedCarpet: Map<string, HTMLCanvasElement>;
}

const BASE = '/sprites';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          `스프라이트를 불러오지 못했습니다: ${src}\n` +
            'Frontend/tools/generate_sprites.mjs 를 실행해 에셋을 생성하세요.',
        ),
      );
    img.src = src;
  });
}

export async function loadSpriteAssets(): Promise<SpriteAssets> {
  const [characters, tiles, props, manifest] = await Promise.all([
    loadImage(`${BASE}/characters.png`),
    loadImage(`${BASE}/tiles.png`),
    loadImage(`${BASE}/props.png`),
    fetch(`${BASE}/manifest.json`).then((r) => r.json() as Promise<SpriteManifest>),
  ]);

  return { characters, tiles, props, manifest, tintedCarpet: new Map() };
}

/**
 * 흰색으로 그려둔 카펫 타일을 방 색으로 물들여 캐시합니다.
 * (매 프레임 색을 입히면 비싸므로 색깔당 한 번만 만듭니다)
 */
export function getTintedCarpet(
  assets: SpriteAssets,
  color: string,
): HTMLCanvasElement | null {
  const cached = assets.tintedCarpet.get(color);
  if (cached) return cached;

  const rect = assets.manifest.tiles['carpet'];
  if (!rect) return null;

  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(assets.tiles, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  // 흰 픽셀에만 색을 곱해 무늬는 살리고 색만 바꿉니다
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, rect.w, rect.h);
  // 원본 알파 유지
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(assets.tiles, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  assets.tintedCarpet.set(color, canvas);
  return canvas;
}

/** 캐릭터 시트에서 (방향, 프레임) 스프라이트 위치를 계산합니다 */
export function characterFrame(
  manifest: SpriteManifest,
  charId: string,
  direction: string,
  frame: number,
): SpriteRect | null {
  const { frameWidth, frameHeight, directions, frames, rows } = manifest.characters;
  const row = rows[charId];
  if (row === undefined) return null;

  const dirIndex = Math.max(0, directions.indexOf(direction));
  const col = dirIndex * frames + (frame % frames);

  return { x: col * frameWidth, y: row * frameHeight, w: frameWidth, h: frameHeight };
}
