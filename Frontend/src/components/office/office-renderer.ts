import type { Agent, AgentId, AgentStatus } from '@shared';
import {
  GRID,
  MAP_COLS,
  MAP_H,
  MAP_ROWS,
  MAP_W,
  PROPS,
  SPAWN,
  TILE,
  ZONES,
  MEETING_SEATS,
  findPath,
  isBlocked,
  zoneAt,
  type PropInstance,
} from './office-map';
import { characterFrame, getTintedCarpet, type SpriteAssets } from './sprites';
import { SPRITE_OF, STAFF_SEAT_MAP } from './office-staff';

/** 타일/초 이동 속도 */
const WALK_SPEED = 4.2;
const PLAYER_SPEED = 5.5;
/** 기본·최대 확대 배율 */
export const ZOOM_DEFAULT = 0.5;
const ZOOM_MAX = 3.2;
/** 버튼·휠·키보드 한 번당 배율 변화 (%) */
const ZOOM_STEP_PERCENT = 5;
/**
 * 자리에서 타자 치는 느낌을 내는 프레임 순서.
 * 걷기 프레임(1, 3)을 번갈아 쓰면 팔이 미세하게 움직여 보입니다.
 */
const TYPING_FRAMES = [0, 1, 0, 3] as const;

type Facing = 'down' | 'left' | 'right' | 'up';

interface Actor {
  id: string;
  sprite: string;
  name: string;
  title: string;
  color: string;
  /** 타일 좌표 (발밑) */
  x: number;
  y: number;
  facing: Facing;
  distance: number;
  moving: boolean;
  status: AgentStatus;
  isPlayer: boolean;
  /** 원래 자기 자리 — 작업 중일 때 이 자리를 바라봅니다 */
  homeX?: number;
  homeY?: number;
  path: Array<{ x: number; y: number }>;
}

interface Drawable {
  sortY: number;
  draw: () => void;
}

export interface NearbyInfo {
  agentId: AgentId;
  zoneLabel: string;
}

export interface ZoneInfo {
  id: string;
  label: string;
  kind: string;
}

export interface RendererCallbacks {
  onBubbleAnchors: (anchors: Map<string, { left: number; top: number }>) => void;
  onNearbyChange: (nearby: NearbyInfo | null) => void;
  onZoneChange?: (zone: ZoneInfo | null) => void;
  onZoomChange?: (zoom: number, baseZoom: number) => void;
}

/**
 * 타일·프롭·스프라이트를 코드로 조립해 그리는 오피스 렌더러.
 *
 * 정적 배경 PNG 를 쓰지 않습니다. 맵 격자와 가구 정의(`office-map.ts`)만으로
 * 바닥·벽·러그·가구·캐릭터를 레이어 순서대로 그립니다.
 */
export class OfficeRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly actors = new Map<string, Actor>();
  private readonly keys = new Set<string>();

  private rafId = 0;
  private lastTime = 0;
  private nearbyId: AgentId | null = null;
  private currentZoneId: string | null = null;
  private meetingMode = false;
  private anchorTargets = new Set<string>();
  private publishedAnchors = new Map<string, { left: number; top: number }>();
  private marker: { x: number; y: number; at: number } | null = null;

  private camX = 0;
  private camY = 0;
  private viewportW = 0;
  private viewportH = 0;
  private zoom = ZOOM_DEFAULT;
  private baseZoom = ZOOM_DEFAULT;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly assets: SpriteAssets,
    agents: Agent[],
    seats: Map<AgentId, { x: number; y: number }>,
    private readonly callbacks: RendererCallbacks,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D 캔버스 컨텍스트를 만들 수 없습니다.');
    this.ctx = context;

    this.actors.set('ceo', {
      id: 'ceo', sprite: 'ceo', name: '대표님', title: '', color: '#e8e8ef',
      x: SPAWN.x, y: SPAWN.y, homeX: SPAWN.x, homeY: SPAWN.y,
      facing: 'up', distance: 0, moving: false,
      status: 'idle', isPlayer: true, path: [],
    });

    for (const agent of agents) {
      // 팀장 좌석은 ZONES, 팀원 좌석은 STAFF_SEAT_MAP 에서 옵니다
      const staffSeat = STAFF_SEAT_MAP.get(agent.id);
      const seat = staffSeat?.seat ?? seats.get(agent.id) ?? SPAWN;

      this.actors.set(agent.id, {
        id: agent.id,
        // 팀원은 소속 부서 팀장과 같은 외형을 씁니다
        sprite: SPRITE_OF.get(agent.id) ?? agent.id,
        name: agent.name,
        title: agent.title,
        color: agent.color,
        x: seat.x,
        y: seat.y,
        homeX: seat.x,
        homeY: seat.y,
        facing: staffSeat?.facing ?? 'down',
        distance: 0,
        moving: false,
        status: 'idle',
        isPlayer: false,
        path: [],
      });
    }
  }


  /* ── 수명주기 ─────────────────────────────────── */

  start(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearKeys);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  /** 현재 배율 (1.0 = 맵 전체가 화면에 맞을 때 기준) */
  getZoom(): number {
    return this.zoom;
  }

  zoomIn(): void {
    this.adjustZoomPercent(ZOOM_STEP_PERCENT);
  }

  zoomOut(): void {
    this.adjustZoomPercent(-ZOOM_STEP_PERCENT);
  }

  resetZoom(): void {
    this.setZoom(this.baseZoom);
  }

  /** 표시 배율(%) 기준으로 확대/축소 */
  private adjustZoomPercent(deltaPercent: number): void {
    const currentPercent = Math.round((this.zoom / this.baseZoom) * 100);
    const nextPercent = currentPercent + deltaPercent;
    this.setZoom((nextPercent / 100) * this.baseZoom);
  }

  setZoom(next: number, anchorSx?: number, anchorSy?: number): void {
    const min = this.minZoom;
    const clamped = clamp(next, min, ZOOM_MAX);
    if (Math.abs(clamped - this.zoom) < 0.001) return;

    const ax = anchorSx ?? this.viewportW / 2;
    const ay = anchorSy ?? this.viewportH / 2;
    const worldX = ax / this.zoom + this.camX;
    const worldY = ay / this.zoom + this.camY;

    this.zoom = clamped;
    this.clampCamera(worldX - ax / this.zoom, worldY - ay / this.zoom);
    this.callbacks.onZoomChange?.(this.zoom, this.baseZoom);
  }

  /* ── 외부 상태 반영 ───────────────────────────── */

  setStatus(id: AgentId, status: AgentStatus, seatX: number, seatY: number): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.status = status;
    if (status !== 'talking' && !this.meetingMode) this.walkTo(actor, seatX, seatY);
  }

  setMeetingMode(
    active: boolean,
    team: AgentId[],
    seats: Map<AgentId, { x: number; y: number }>,
  ): void {
    this.meetingMode = active;

    if (active) {
      team.forEach((id, index) => {
        const actor = this.actors.get(id);
        const seat = MEETING_SEATS[index % MEETING_SEATS.length];
        if (actor && seat) this.walkTo(actor, seat.x, seat.y);
      });
      return;
    }
    for (const [id, seat] of seats) {
      const actor = this.actors.get(id);
      if (actor) this.walkTo(actor, seat.x, seat.y);
    }
  }

  faceToward(from: AgentId, to: AgentId): void {
    const a = this.actors.get(from);
    const b = this.actors.get(to);
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    a.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }

  resetAll(seats: Map<AgentId, { x: number; y: number }>): void {
    this.meetingMode = false;
    for (const [id, seat] of seats) {
      const actor = this.actors.get(id);
      if (actor) {
        actor.status = 'idle';
        this.walkTo(actor, seat.x, seat.y);
      }
    }
  }

  setAnchorTargets(ids: string[]): void {
    this.anchorTargets = new Set(ids);
    if (ids.length === 0 && this.publishedAnchors.size > 0) {
      this.publishedAnchors.clear();
      this.callbacks.onBubbleAnchors(new Map());
    }
  }

  /* ── 입력 ─────────────────────────────────────── */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTyping(e.target)) return;
    if (MOVE_KEYS.has(e.key)) {
      this.keys.add(e.key);
      const player = this.actors.get('ceo');
      if (player) player.path = [];
      e.preventDefault();
      return;
    }
    if (e.key === '+' || e.key === '=') {
      this.zoomIn();
      e.preventDefault();
      return;
    }
    if (e.key === '-' || e.key === '_') {
      this.zoomOut();
      e.preventDefault();
      return;
    }
    if (e.key === '0') {
      this.resetZoom();
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
  };

  private clearKeys = (): void => {
    this.keys.clear();
  };

  private onPointerDown = (e: PointerEvent): void => {
    const player = this.actors.get('ceo');
    if (!player || this.needsSize) return;

    const rect = this.canvas.getBoundingClientRect();
    const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    const tx = Math.round(tile.x);
    const ty = Math.round(tile.y);

    if (isBlocked(tx, ty)) return;

    const path = findPath(player, { x: tx, y: ty });
    if (path.length === 0) return;

    player.path = path;
    this.marker = { x: tx, y: ty, at: performance.now() };
  };

  /** 커서 위치를 기준으로 휠 줌 */
  private onWheel = (e: WheelEvent): void => {
    if (this.isTyping(e.target)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP_PERCENT : ZOOM_STEP_PERCENT;
    this.adjustZoomPercent(delta);
  };

  private isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
  }

  /* ── 이동 ─────────────────────────────────────── */

  private walkTo(actor: Actor, x: number, y: number): void {
    if (Math.hypot(actor.x - x, actor.y - y) < 0.15) {
      actor.path = [];
      return;
    }
    const path = findPath(actor, { x, y });
    actor.path = path.length > 0 ? path : [{ x, y }];
  }

  private canStand(x: number, y: number): boolean {
    return !isBlocked(x, y);
  }

  private movePlayer(actor: Actor, dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a') || this.keys.has('A')) dx -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('d') || this.keys.has('D')) dx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('w') || this.keys.has('W')) dy -= 1;
    if (this.keys.has('ArrowDown') || this.keys.has('s') || this.keys.has('S')) dy += 1;

    if (dx === 0 && dy === 0) {
      this.followPath(actor, dt, PLAYER_SPEED);
      return;
    }

    const len = Math.hypot(dx, dy);
    const step = (PLAYER_SPEED * dt) / 1000;
    const nx = actor.x + (dx / len) * step;
    const ny = actor.y + (dy / len) * step;

    if (this.canStand(nx, actor.y)) actor.x = nx;
    if (this.canStand(actor.x, ny)) actor.y = ny;

    actor.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    actor.moving = true;
    actor.distance += step;
  }

  private followPath(actor: Actor, dt: number, speed: number): void {
    const next = actor.path[0];
    if (!next) {
      actor.moving = false;
      return;
    }

    const dx = next.x - actor.x;
    const dy = next.y - actor.y;
    const dist = Math.hypot(dx, dy);
    const step = (speed * dt) / 1000;

    if (dist <= step) {
      actor.x = next.x;
      actor.y = next.y;
      actor.path.shift();
      actor.distance += dist;
    } else {
      actor.x += (dx / dist) * step;
      actor.y += (dy / dist) * step;
      actor.distance += step;
    }

    actor.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    actor.moving = true;
  }

  /* ── 렌더 루프 ────────────────────────────────── */

  private loop = (now: number): void => {
    const dt = Math.min(64, now - this.lastTime);
    this.lastTime = now;
    this.update(dt);
    this.draw();
    this.reportAnchors();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    for (const actor of this.actors.values()) {
      if (actor.isPlayer) this.movePlayer(actor, dt);
      else this.followPath(actor, dt, WALK_SPEED);
    }
    this.updateCamera();
    this.updateNearby();
    if (this.marker && performance.now() - this.marker.at > 900) this.marker = null;
  }

  private updateCamera(): void {
    const player = this.actors.get('ceo');
    if (!player || this.viewportW < 1) return;

    const foot = this.footPx(player);
    this.clampCamera(foot.x - this.viewW / 2, foot.y - this.viewH / 2);
  }

  /** 월드 좌표 기준 가시 영역 크기 */
  private get viewW(): number {
    return this.viewportW / this.zoom;
  }

  private get viewH(): number {
    return this.viewportH / this.zoom;
  }

  /** 맵 전체가 들어오는 최소 배율 (사이드바 영역 제외) */
  private get minZoom(): number {
    if (this.viewportW < 1 || this.viewportH < 1) return 0.5;
    return Math.min(this.viewportW / MAP_W, this.viewportH / MAP_H);
  }

  /**
   * 카메라 위치를 맵 안으로 제한합니다.
   * 시야가 맵보다 넓으면 맵을 가운데 정렬해 빈 여백이 한쪽으로 쏠리지 않게 합니다.
   */
  private clampCamera(x: number, y: number): void {
    const { viewW, viewH } = this;

    if (viewW >= MAP_W) {
      this.camX = (MAP_W - viewW) / 2;
    } else {
      this.camX = clamp(x, 0, MAP_W - viewW);
    }

    if (viewH >= MAP_H) {
      this.camY = (MAP_H - viewH) / 2;
    } else {
      this.camY = clamp(y, 0, MAP_H - viewH);
    }
  }

  private updateNearby(): void {
    const player = this.actors.get('ceo');
    if (!player) return;

    const currentZone = zoneAt(player.x, player.y);
    const nextZoneId = currentZone?.id ?? null;
    if (nextZoneId !== this.currentZoneId) {
      this.currentZoneId = nextZoneId;
      this.callbacks.onZoneChange?.(
        currentZone
          ? { id: currentZone.id, label: currentZone.label, kind: currentZone.kind }
          : null,
      );
    }

    let found: AgentId | null = null;
    let best = 2.8;
    for (const actor of this.actors.values()) {
      if (actor.isPlayer) continue;
      const d = Math.hypot(actor.x - player.x, actor.y - player.y);
      if (d < best) {
        best = d;
        found = actor.id as AgentId;
      }
    }

    if (found === this.nearbyId) return;
    this.nearbyId = found;

    if (!found) {
      this.callbacks.onNearbyChange(null);
      return;
    }
    const actor = this.actors.get(found);
    const zone = actor ? zoneAt(actor.x, actor.y) : null;
    this.callbacks.onNearbyChange({ agentId: found, zoneLabel: zone?.label ?? '' });
  }

  private get dpr(): number {
    return window.devicePixelRatio || 1;
  }

  get needsSize(): boolean {
    return this.canvas.width < 1 || this.canvas.height < 1;
  }

  /** 캔버스 버퍼만 갱신합니다 (표시 크기는 CSS 100%) */
  resize(width: number, height: number): void {
    if (width < 1 || height < 1) return;
    const dpr = this.dpr;
    const bufferW = Math.floor(width * dpr);
    const bufferH = Math.floor(height * dpr);
    if (this.canvas.width !== bufferW || this.canvas.height !== bufferH) {
      this.canvas.width = bufferW;
      this.canvas.height = bufferH;
    }
    this.viewportW = width;
    this.viewportH = height;
    const wasAtBase = Math.abs(this.zoom - this.baseZoom) < 0.001;
    this.baseZoom = Math.max(ZOOM_DEFAULT, this.minZoom);
    if (wasAtBase || this.zoom < this.minZoom) {
      this.zoom = this.baseZoom;
      this.callbacks.onZoomChange?.(this.zoom, this.baseZoom);
    }
    this.updateCamera();
  }

  /* ── 좌표 변환 ────────────────────────────────── */

  private footPx(actor: Actor): { x: number; y: number } {
    return {
      x: actor.x * TILE + TILE / 2,
      y: actor.y * TILE + TILE - 2,
    };
  }

  private screenToTile(sx: number, sy: number): { x: number; y: number } {
    const worldX = sx / this.zoom + this.camX;
    const worldY = sy / this.zoom + this.camY;
    return { x: worldX / TILE, y: worldY / TILE };
  }

  /* ── 그리기 ───────────────────────────────────── */

  private draw(): void {
    const { ctx } = this;
    if (this.needsSize) return;

    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    this.drawFloor();
    this.drawZoneRugs();
    this.drawZoneLabels();

    const drawables: Drawable[] = [];

    for (const prop of PROPS) {
      drawables.push({
        sortY: (prop.y + 1) * TILE,
        draw: () => this.drawProp(prop),
      });
    }

    for (const actor of this.actors.values()) {
      const foot = this.footPx(actor);
      drawables.push({
        sortY: foot.y,
        draw: () => this.drawActor(actor),
      });
    }

    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const item of drawables) item.draw();

    this.drawMarker();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawFloor(): void {
    const { ctx, assets } = this;
    const tiles = assets.manifest.tiles;
    const wood = tiles['floor_wood'];
    const tile = tiles['floor_tile'];
    const wallFace = tiles['wall_face'];

    const tx0 = Math.max(0, Math.floor(this.camX / TILE) - 1);
    const ty0 = Math.max(0, Math.floor(this.camY / TILE) - 1);
    const tx1 = Math.min(MAP_COLS, Math.ceil((this.camX + this.viewW) / TILE) + 1);
    const ty1 = Math.min(MAP_ROWS, Math.ceil((this.camY + this.viewH) / TILE) + 1);

    for (let ty = ty0; ty < ty1; ty++) {
      for (let tx = tx0; tx < tx1; tx++) {
        const px = tx * TILE;
        const py = ty * TILE;
        const cell = GRID.cells[ty]?.[tx];
        if (cell === 'floor') {
          const kind = GRID.floor[ty]?.[tx] === 'wood' ? wood : tile;
          if (kind) {
            ctx.drawImage(assets.tiles, kind.x, kind.y, kind.w, kind.h, px, py, TILE, TILE);
          }
        } else if (cell === 'wall' && wallFace) {
          ctx.drawImage(assets.tiles, wallFace.x, wallFace.y, wallFace.w, wallFace.h, px, py, TILE, TILE);
        } else {
          ctx.fillStyle = '#0d1118';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
  }

  private drawZoneRugs(): void {
    const { ctx } = this;
    const carpetRect = this.assets.manifest.tiles['carpet'];
    if (!carpetRect) return;

    for (const zone of ZONES) {
      if (zone.rug === false || (zone.rug === undefined && (zone.kind === 'lounge' || zone.kind === 'entrance'))) continue;
      const tinted = getTintedCarpet(this.assets, zone.color);
      if (!tinted) continue;

      for (let ty = zone.y + 1; ty < zone.y + zone.h - 1; ty++) {
        for (let tx = zone.x + 1; tx < zone.x + zone.w - 1; tx++) {
          if (GRID.cells[ty]?.[tx] !== 'floor') continue;
          if (GRID.blocked[ty]?.[tx]) continue;
          ctx.drawImage(tinted, tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }
  }

  private drawZoneLabels(): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = 'bold 11px "Pretendard", system-ui, sans-serif';
    ctx.textAlign = 'center';

    for (const zone of ZONES) {
      if (zone.showLabel === false) continue;
      const cx = (zone.x + zone.w / 2) * TILE;
      const cy = (zone.y + 0.65) * TILE;
      const label = zone.label;

      const textW = ctx.measureText(label).width;
      const boxW = textW + 14;
      const boxH = 16;

      ctx.fillStyle = 'rgba(14,18,26,0.72)';
      roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, 8);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(zone.color, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = zone.color;
      ctx.fillText(label, cx, cy + 4);
    }
    ctx.restore();
  }

  private drawProp(prop: PropInstance): void {
    const rect = this.assets.manifest.props[prop.kind];
    if (!rect) return;

    const { ctx, assets } = this;
    const bottom = (prop.y + 1) * TILE;
    const left = prop.x * TILE + TILE / 2 - rect.w / 2;

    ctx.drawImage(assets.props, rect.x, rect.y, rect.w, rect.h, left, bottom - rect.h, rect.w, rect.h);
  }

  private drawMarker(): void {
    if (!this.marker) return;
    const { ctx } = this;
    const age = (performance.now() - this.marker.at) / 900;
    const px = this.marker.x * TILE + TILE / 2;
    const py = this.marker.y * TILE + TILE - 2;

    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = '#8ab4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px, py, 6 + age * 12, 4 + age * 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawActor(actor: Actor): void {
    const { ctx, assets } = this;
    const { frameWidth, frameHeight } = assets.manifest.characters;
    const foot = this.footPx(actor);

    // 자리에 앉아 일하는 중이면 책상 쪽(위)을 보고 타자 치듯 미세하게 움직입니다
    const working = !actor.moving && !actor.isPlayer && actor.status === 'thinking';
    const facing = working ? 'up' : actor.facing;

    const frame = actor.moving
      ? Math.floor(actor.distance / 0.35) % 4
      : working
        ? TYPING_FRAMES[Math.floor(performance.now() / 190) % TYPING_FRAMES.length] ?? 0
        : 0;

    const rect = characterFrame(assets.manifest, actor.sprite, facing, frame);
    if (!rect) return;

    const w = frameWidth;
    const h = frameHeight;
    const drawX = Math.round(foot.x - w / 2);
    // 타자 칠 때 어깨가 아주 살짝 들썩입니다
    const bob = working ? Math.round(Math.sin(performance.now() / 150 + foot.x) * 0.6) : 0;
    const drawY = Math.round(foot.y - h) + bob;

    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(foot.x, foot.y - 2, w * 0.28, w * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.drawImage(assets.characters, rect.x, rect.y, rect.w, rect.h, drawX, drawY, w, h);
    if (working) this.drawWorkingEffect(foot.x, drawY);
    this.drawNameTag(actor, foot.x, drawY - 4);
  }

  /**
   * 작업 중 표시 — 머리 위에 회전하는 점 3개.
   * "지금 이 사람이 실제로 무언가 만들고 있다" 를 한눈에 보여줍니다.
   */
  private drawWorkingEffect(cx: number, topY: number): void {
    const { ctx } = this;
    const t = performance.now() / 1000;

    ctx.save();
    for (let i = 0; i < 3; i++) {
      const phase = t * 3 - i * 0.5;
      const lift = Math.max(0, Math.sin(phase)) * 3;
      ctx.globalAlpha = 0.35 + Math.max(0, Math.sin(phase)) * 0.55;
      ctx.fillStyle = '#4f8ef7';
      ctx.beginPath();
      ctx.arc(cx - 6 + i * 6, topY - 16 - lift, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawNameTag(actor: Actor, cx: number, cy: number): void {
    const { ctx } = this;
    const label = actor.isPlayer ? actor.name : `${actor.name} ${actor.title}`;

    ctx.save();
    ctx.font = 'bold 11px "Pretendard", system-ui, sans-serif';
    ctx.textAlign = 'center';

    const textW = ctx.measureText(label).width;
    const dotW = actor.status === 'idle' ? 0 : 10;
    const boxW = textW + 14 + dotW;

    ctx.fillStyle = 'rgba(14,18,26,0.86)';
    roundRect(ctx, cx - boxW / 2, cy - 15, boxW, 17, 8);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(actor.color, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();

    if (dotW > 0) {
      ctx.fillStyle = STATUS_COLOR[actor.status];
      ctx.beginPath();
      ctx.arc(cx - boxW / 2 + 9, cy - 6.5, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = actor.isPlayer ? '#ffffff' : actor.color;
    ctx.fillText(label, cx + dotW / 2, cy - 2);
    ctx.restore();
  }

  private reportAnchors(): void {
    if (this.anchorTargets.size === 0 || this.needsSize) return;

    const next = new Map<string, { left: number; top: number }>();
    let changed = this.publishedAnchors.size !== this.anchorTargets.size;

    for (const id of this.anchorTargets) {
      const actor = this.actors.get(id);
      if (!actor) continue;
      const foot = this.footPx(actor);
      const point = {
        left: (foot.x - this.camX) * this.zoom,
        top: (foot.y - this.camY) * this.zoom - 58,
      };
      next.set(id, point);
      const prev = this.publishedAnchors.get(id);
      if (!prev || Math.abs(prev.left - point.left) > 0.5 || Math.abs(prev.top - point.top) > 0.5) {
        changed = true;
      }
    }

    if (!changed) return;
    this.publishedAnchors = next;
    this.callbacks.onBubbleAnchors(next);
  }
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  idle: '#9ca3af',
  thinking: '#60a5fa',
  talking: '#fbbf24',
  done: '#34d399',
};

const MOVE_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
]);

function hexToRgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
