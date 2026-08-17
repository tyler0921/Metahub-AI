import type { Agent, AgentId, AgentStatus, SpeechEvent, ToolKind } from '@shared';
import {
  MAP_H,
  MAP_W,
  SPAWN,
  TILE,
  ZONES,
  MEETING_SEATS,
  findPath,
  isBlocked,
  zoneAt,
} from './office-map';
import { characterFrame, type SpriteAssets } from './sprites';
import { SPRITE_OF, STAFF_SEAT_MAP } from './office-staff';
// 상태색의 출처는 한 곳입니다 — 예전에는 이 파일이 복사본을 들고 있어서
// 팔레트를 바꿀 때마다 두 군데를 따로 고쳐야 했습니다.
import { STATUS_COLOR } from '@/lib/agent-status';

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

/**
 * 대기 직원이 잠깐 다녀오는 휴게 지점 (타일 좌표).
 * 카페·포커스 라운지·프로젝트 스튜디오 언저리의 빈 바닥입니다.
 */
const LEISURE_POINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 42, y: 26 }, { x: 47, y: 26 }, // 카페
  { x: 32, y: 26 }, { x: 36, y: 26 }, // 포커스 라운지
  { x: 25, y: 12 }, { x: 28, y: 12 }, // 중앙 라운지
];

/** 배회 결정 간격 (ms) — 너무 잦으면 오피스가 산만해집니다 */
const CHAT_SPOTS = [
  [{ x: 42, y: 26 }, { x: 44, y: 26 }],
  [{ x: 32, y: 26 }, { x: 34, y: 26 }],
  [{ x: 25, y: 12 }, { x: 27, y: 12 }],
] as const;

const SMALL_TALK = [
  ['오늘 점심은 뭐 드실래요?', '저는 김치찌개 생각 중이에요. 같이 가실래요?'],
  ['커피 한 잔 하실래요?', '좋아요. 잠깐 쉬었다가 다시 집중하죠.'],
  ['주말 잘 보내셨어요?', '네, 푹 쉬고 왔어요. 오늘 컨디션 좋네요!'],
  ['요즘 출근길은 괜찮으셨어요?', '오늘은 생각보다 한산해서 일찍 왔어요.'],
  ['여기 음악 분위기 좋지 않아요?', '맞아요. 조용해서 집중하기 딱 좋아요.'],
] as const;

const AMBIENT_CHAT_MIN_MS = 12_000;
const AMBIENT_CHAT_MAX_MS = 24_000;
const AMBIENT_CHAT_DURATION_MS = 11_000;

const WANDER_MIN_MS = 28_000;
const WANDER_MAX_MS = 55_000;

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
  /** 지금 쓰고 있는 도구 — 머리 위 아이콘 */
  tool: ToolKind | null;
  toolLabel: string;
  /** 다음 배회 결정 시각 (대기 중일 때만 씀) */
  wanderAt?: number;
  /** 지금 휴게 공간에 나와 있는가 */
  atLeisure?: boolean;
  ambientPartner?: AgentId;
}

interface AmbientConversation {
  a: AgentId;
  b: AgentId;
  firstLine: string;
  secondLine: string;
  startedAt: number | null;
  replied: boolean;
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
  onActorPositions?: (
    positions: ReadonlyMap<string, { x: number; y: number; isPlayer: boolean }>,
  ) => void;
  /**
   * 직원을 클릭했다. 빈 바닥을 클릭하면 null 이 옵니다.
   * 근접(`onNearbyChange`)과 달리 **대표가 의도적으로 지목한** 신호입니다.
   */
  onActorSelect?: (agentId: AgentId | null) => void;
  onAmbientSpeech?: (event: SpeechEvent) => void;
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
  /** 이번 업무에 투입된 부서 — 비면 조명을 나누지 않습니다 */
  private activeTeams = new Set<string>();
  private anchorTargets = new Set<string>();
  private publishedAnchors = new Map<string, { left: number; top: number }>();
  private positionTick = 0;
  private marker: { x: number; y: number; at: number } | null = null;
  /** 세션 오류 — 투입 직원 머리 위에 경고를 띄웁니다 */
  private sessionAlert = false;
  private ambientConversation: AmbientConversation | null = null;
  private ambientConversationAt = performance.now() + 5_000;

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
      tool: null, toolLabel: '',
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
        tool: null,
        toolLabel: '',
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
    // 업무가 잡히면 휴게 배회를 중단합니다
    if (status !== 'idle') {
      actor.atLeisure = false;
      actor.wanderAt = undefined;
    }
    // 완료·유휴는 자리로 돌아가고, 발언 중에는 그 자리에 섭니다
    if (status !== 'talking' && !this.meetingMode) this.walkTo(actor, seatX, seatY);
  }

  /** 머리 위 도구 아이콘 — null 이면 지웁니다 */
  setTool(id: AgentId, tool: ToolKind | null, label = ''): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    actor.tool = tool;
    actor.toolLabel = label;
  }

  /** 세션 오류 시 투입 직원 머리 위에 경고를 띄웁니다 */
  setSessionAlert(on: boolean): void {
    this.sessionAlert = on;
  }

  /**
   * 투입된 부서만 밝게 둡니다.
   *
   * 밝히는 게 아니라 **나머지를 눌러서** 만듭니다. 조명을 더하면 픽셀
   * 팔레트가 날아가지만, 어둡게 덮으면 톤이 유지된 채 시선만 모입니다.
   * 목록이 비면(대기 중) 아무 데도 누르지 않습니다.
   */
  setActiveTeams(teams: AgentId[]): void {
    this.activeTeams = new Set(teams.map((id) => {
      // 팀원 id 는 `dev-senior` 처럼 팀장 id 를 접두사로 씁니다
      const dash = id.indexOf('-');
      return dash === -1 ? id : id.slice(0, dash);
    }));
  }

  setMeetingMode(
    active: boolean,
    team: AgentId[],
    seats: Map<AgentId, { x: number; y: number }>,
  ): void {
    if (active && this.ambientConversation) this.finishAmbientConversation();
    this.meetingMode = active;

    if (active) {
      team.forEach((id, index) => {
        const actor = this.actors.get(id);
        const seat = MEETING_SEATS[index % MEETING_SEATS.length];
        if (actor && seat) {
          actor.atLeisure = false;
          actor.wanderAt = undefined;
          this.walkTo(actor, seat.x, seat.y);
        }
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
    this.finishAmbientConversation();
    this.meetingMode = false;
    this.sessionAlert = false;
    for (const [id, seat] of seats) {
      const actor = this.actors.get(id);
      if (actor) {
        actor.status = 'idle';
        actor.tool = null;
        actor.toolLabel = '';
        actor.atLeisure = false;
        actor.wanderAt = undefined;
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

    // 직원을 먼저 판정합니다. 직원 위를 눌렀는데 대표가 걸어가 버리면
    // "누른 것"과 "일어난 일"이 어긋나 보입니다.
    const hit = this.actorAt(tile.x, tile.y);
    if (hit) {
      this.callbacks.onActorSelect?.(hit);
      return;
    }
    this.callbacks.onActorSelect?.(null);

    const tx = Math.round(tile.x);
    const ty = Math.round(tile.y);

    if (isBlocked(tx, ty)) return;

    const path = findPath(player, { x: tx, y: ty });
    if (path.length === 0) return;

    player.path = path;
    this.marker = { x: tx, y: ty, at: performance.now() };
  };

  /**
   * 이 타일 좌표(소수) 위에 서 있는 직원.
   *
   * 스프라이트 픽셀 대신 타일 기준으로 봅니다. 캐릭터는 발밑 타일에서
   * 위로 한 칸 반 정도를 차지하므로 그 상자와 겹치면 맞은 것으로 칩니다.
   * 겹치는 직원이 여럿이면 가로로 가장 가까운 쪽을 고릅니다.
   */
  private actorAt(tileX: number, tileY: number): AgentId | null {
    let best: { id: AgentId; dx: number } | null = null;

    for (const actor of this.actors.values()) {
      if (actor.isPlayer) continue;

      const centerX = actor.x + 0.5;
      const footY = actor.y + 1;
      const dx = Math.abs(tileX - centerX);
      const above = footY - tileY;

      if (dx > 0.6 || above < -0.15 || above > 1.6) continue;
      if (!best || dx < best.dx) best = { id: actor.id as AgentId, dx };
    }

    return best?.id ?? null;
  }

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
    this.reportPositions();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.updateAmbientConversation();
    for (const actor of this.actors.values()) {
      if (actor.isPlayer) this.movePlayer(actor, dt);
      else {
        this.followPath(actor, dt, WALK_SPEED);
        this.updateWander(actor);
      }
    }
    this.updateCamera();
    this.updateNearby();
    if (this.marker && performance.now() - this.marker.at > 900) this.marker = null;
  }

  private updateAmbientConversation(): void {
    const now = performance.now();
    const conversation = this.ambientConversation;

    if (conversation) {
      const a = this.actors.get(conversation.a);
      const b = this.actors.get(conversation.b);
      if (!a || !b || a.status !== 'idle' || b.status !== 'idle' || this.meetingMode) {
        this.finishAmbientConversation();
        return;
      }

      if (conversation.startedAt === null) {
        if (a.path.length > 0 || b.path.length > 0 || a.moving || b.moving) return;
        this.faceToward(conversation.a, conversation.b);
        this.faceToward(conversation.b, conversation.a);
        conversation.startedAt = now;
        this.emitAmbientSpeech(conversation.a, conversation.b, conversation.firstLine);
        return;
      }

      this.faceToward(conversation.a, conversation.b);
      this.faceToward(conversation.b, conversation.a);
      if (!conversation.replied && now - conversation.startedAt >= 3_200) {
        conversation.replied = true;
        this.emitAmbientSpeech(conversation.b, conversation.a, conversation.secondLine);
      }
      if (now - conversation.startedAt >= AMBIENT_CHAT_DURATION_MS) {
        this.finishAmbientConversation();
      }
      return;
    }

    if (this.meetingMode || now < this.ambientConversationAt) return;
    const candidates = [...this.actors.values()].filter((actor) =>
      !actor.isPlayer &&
      actor.status === 'idle' &&
      !actor.atLeisure &&
      !actor.ambientPartner &&
      actor.path.length === 0,
    );
    if (candidates.length < 2) {
      this.scheduleNextAmbientConversation(now);
      return;
    }

    const firstIndex = Math.floor(Math.random() * candidates.length);
    const a = candidates[firstIndex];
    candidates.splice(firstIndex, 1);
    const b = candidates[Math.floor(Math.random() * candidates.length)];
    const spot = CHAT_SPOTS[Math.floor(Math.random() * CHAT_SPOTS.length)];
    const lines = SMALL_TALK[Math.floor(Math.random() * SMALL_TALK.length)];
    if (!a || !b || !spot || !lines) return;

    a.atLeisure = true;
    b.atLeisure = true;
    a.ambientPartner = b.id as AgentId;
    b.ambientPartner = a.id as AgentId;
    a.wanderAt = undefined;
    b.wanderAt = undefined;
    this.walkTo(a, spot[0].x, spot[0].y);
    this.walkTo(b, spot[1].x, spot[1].y);
    this.ambientConversation = {
      a: a.id as AgentId,
      b: b.id as AgentId,
      firstLine: lines[0],
      secondLine: lines[1],
      startedAt: null,
      replied: false,
    };
  }

  private emitAmbientSpeech(agent: AgentId, to: AgentId, text: string): void {
    this.callbacks.onAmbientSpeech?.({
      type: 'speech',
      agent,
      to,
      phase: 'ambient',
      text,
      at: Date.now(),
    });
  }

  private finishAmbientConversation(): void {
    const conversation = this.ambientConversation;
    if (!conversation) return;
    for (const id of [conversation.a, conversation.b]) {
      const actor = this.actors.get(id);
      if (!actor) continue;
      actor.ambientPartner = undefined;
      actor.atLeisure = false;
      if (actor.status === 'idle' && actor.homeX !== undefined && actor.homeY !== undefined) {
        this.walkTo(actor, actor.homeX, actor.homeY);
      }
    }
    this.ambientConversation = null;
    this.scheduleNextAmbientConversation(performance.now());
  }

  private scheduleNextAmbientConversation(now: number): void {
    this.ambientConversationAt = now + AMBIENT_CHAT_MIN_MS +
      Math.random() * (AMBIENT_CHAT_MAX_MS - AMBIENT_CHAT_MIN_MS);
  }

  /**
   * 대기 직원의 휴게 이동.
   *
   * 회의 중이거나 업무 중(thinking/talking)인 직원은 건드리지 않습니다.
   * 자리에 앉아 있는 idle 직원만 이따금 카페·라운지로 다녀옵니다 —
   * "대기 직원의 커피머신 이동" 을 가볍게 흉내 내는 정도입니다.
   */
  private updateWander(actor: Actor): void {
    if (
      this.meetingMode ||
      actor.status !== 'idle' ||
      actor.path.length > 0 ||
      actor.ambientPartner
    ) return;

    const now = performance.now();
    if (actor.wanderAt === undefined) {
      actor.wanderAt = now + this.wanderDelay();
      return;
    }
    if (now < actor.wanderAt) return;

    if (actor.atLeisure) {
      // 자리로 복귀
      actor.atLeisure = false;
      if (actor.homeX !== undefined && actor.homeY !== undefined) {
        this.walkTo(actor, actor.homeX, actor.homeY);
      }
    } else {
      const spot = this.pickLeisure();
      if (spot) {
        actor.atLeisure = true;
        this.walkTo(actor, spot.x, spot.y);
      }
    }
    actor.wanderAt = now + this.wanderDelay();
  }

  private wanderDelay(): number {
    return WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS);
  }

  private pickLeisure(): { x: number; y: number } | null {
    const start = Math.floor(Math.random() * LEISURE_POINTS.length);
    for (let i = 0; i < LEISURE_POINTS.length; i++) {
      const spot = LEISURE_POINTS[(start + i) % LEISURE_POINTS.length];
      if (spot && this.canStand(spot.x, spot.y)) return spot;
    }
    return null;
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
    ctx.fillStyle = '#151923';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    this.drawFloor();
    this.drawIdleZoneShade();
    this.drawZoneLabels();

    const drawables: Drawable[] = [];

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
    this.ctx.drawImage(this.assets.officeMap, 0, 0, MAP_W, MAP_H);
  }

  /**
   * 이번 업무에 참여하지 않는 부서를 은은하게 눌러 둡니다.
   *
   * 캐릭터보다 **아래**에 그립니다. 사람 위를 덮으면 쉬는 직원이
   * 회색으로 죽어 보여서, 공간이 조용한 게 아니라 고장 난 것처럼 읽힙니다.
   */
  private drawIdleZoneShade(): void {
    if (this.activeTeams.size === 0) return;

    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(12, 16, 24, 0.28)';

    for (const zone of ZONES) {
      if (zone.kind !== 'department') continue;
      if (zone.agent && this.activeTeams.has(zone.agent)) continue;
      ctx.fillRect(zone.x * TILE, zone.y * TILE, zone.w * TILE, zone.h * TILE);
    }

    ctx.restore();
  }

  private drawZoneLabels(): void {
    const { ctx } = this;
    ctx.save();
    // letterSpacing 은 lib.dom 타입에 없는 브라우저가 있어 쓰지 않습니다
    ctx.font = '600 10px "Pretendard Variable", Pretendard, system-ui, sans-serif';
    ctx.textAlign = 'center';

    // 조명을 나누는 중이면(투입 부서가 정해짐) 비활성 라벨을 눌러 시선을 모읍니다
    const lighting = this.activeTeams.size > 0;

    for (const zone of ZONES) {
      if (zone.showLabel === false) continue;

      const isDept = Boolean(zone.agent);
      const active = isDept && zone.agent ? this.activeTeams.has(zone.agent) : false;

      const cx = (zone.x + zone.w / 2) * TILE;
      const cy = (zone.y + 0.65) * TILE;
      const label = zone.label;

      const textW = ctx.measureText(label).width;
      // 부서 플로어 라벨은 상태 점을 위해 왼쪽에 여백을 둡니다
      const dotSpace = isDept ? 12 : 0;
      const boxW = textW + 14 + dotSpace;
      const boxH = 16;

      // 조명이 켜졌고 이 부서가 비활성이면 라벨도 함께 가라앉힙니다
      const dimmed = lighting && isDept && !active;
      ctx.globalAlpha = dimmed ? 0.4 : 1;

      // 형광 배지가 아니라 사무실 사인처럼 — 테두리도 색도 쓰지 않습니다
      ctx.fillStyle = active ? 'rgba(20,26,36,0.82)' : 'rgba(24,31,42,0.62)';
      roundRect(ctx, cx - boxW / 2, cy - boxH / 2, boxW, boxH, 5);
      ctx.fill();

      if (isDept) {
        // 활성 부서는 액센트 점, 대기 부서는 은은한 회색 점
        ctx.fillStyle = active ? '#8b83ff' : 'rgba(154,160,168,0.7)';
        ctx.beginPath();
        ctx.arc(cx - boxW / 2 + 9, cy, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(241,244,248,0.92)';
      ctx.fillText(label, cx + dotSpace / 2, cy + 4);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawMarker(): void {
    if (!this.marker) return;
    const { ctx } = this;
    const age = (performance.now() - this.marker.at) / 900;
    const px = this.marker.x * TILE + TILE / 2;
    const py = this.marker.y * TILE + TILE - 2;

    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = 'rgba(252,253,254,0.85)';
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
    const atDesk = actor.homeX !== undefined && actor.homeY !== undefined &&
      Math.hypot(actor.x - actor.homeX, actor.y - actor.homeY) < 0.35;
    const ambientWorking = actor.status === 'idle' && !actor.atLeisure && atDesk;
    const working = !actor.moving && !actor.isPlayer &&
      (actor.status === 'thinking' || ambientWorking);
    const talking = !actor.moving && !actor.isPlayer &&
      (actor.status === 'talking' || Boolean(actor.ambientPartner));
    const done = !actor.moving && !actor.isPlayer && actor.status === 'done';
    const idleSit = !actor.moving && !actor.isPlayer && actor.status === 'idle' &&
      !ambientWorking && !actor.ambientPartner;
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
    // 타자 칠 때 어깨가 들썩이고, 대기 중엔 숨 쉬듯 미세하게 흔들립니다
    const t = performance.now();
    const bob = working
      ? Math.round(Math.sin(t / 150 + foot.x) * 0.6)
      : idleSit
        ? Math.round(Math.sin(t / 900 + foot.x) * 0.4)
        : 0;
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
    if (talking) this.drawTalkingEffect(foot.x, drawY);
    if (done) this.drawDoneEffect(foot.x, drawY);
    if (actor.tool) this.drawToolBadge(foot.x, drawY, actor.tool);
    if (this.sessionAlert && !actor.isPlayer && actor.status !== 'idle') {
      this.drawAlertEffect(foot.x, drawY);
    }

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
      ctx.fillStyle = STATUS_COLOR.thinking;
      ctx.beginPath();
      ctx.arc(cx - 6 + i * 6, topY - 16 - lift, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 발언 중 — 입 앞에서 퍼지는 파동 */
  private drawTalkingEffect(cx: number, topY: number): void {
    const { ctx } = this;
    const t = performance.now() / 1000;

    ctx.save();
    for (let i = 0; i < 2; i++) {
      const age = (t * 1.6 + i * 0.5) % 1;
      ctx.globalAlpha = (1 - age) * 0.7;
      ctx.strokeStyle = STATUS_COLOR.talking;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx + 8, topY + 10, 3 + age * 7, -0.6, 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 완료 — 머리 위 작은 체크 */
  private drawDoneEffect(cx: number, topY: number): void {
    const { ctx } = this;
    const y = topY - 14;

    ctx.save();
    ctx.fillStyle = STATUS_COLOR.done;
    ctx.beginPath();
    ctx.arc(cx, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 2.5, y);
    ctx.lineTo(cx - 0.5, y + 2);
    ctx.lineTo(cx + 2.8, y - 2.2);
    ctx.stroke();
    ctx.restore();
  }

  /** 도구 사용 — 이름표 위에 작은 뱃지 */
  private drawToolBadge(cx: number, topY: number, tool: ToolKind): void {
    const { ctx } = this;
    const y = topY - 28;
    const label = tool === 'vault' ? 'V' : 'F';
    const color = tool === 'vault' ? '#8b7355' : '#3f857d';

    ctx.save();
    ctx.fillStyle = color;
    roundRect(ctx, cx - 8, y - 8, 16, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 9px "Pretendard Variable", Pretendard, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, y + 2);
    ctx.restore();
  }

  /** 세션 오류 — 빨간 느낌표 */
  private drawAlertEffect(cx: number, topY: number): void {
    const { ctx } = this;
    const pulse = 0.65 + Math.sin(performance.now() / 220) * 0.35;
    const y = topY - 30;

    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#d95c5c';
    ctx.beginPath();
    ctx.moveTo(cx, y - 8);
    ctx.lineTo(cx + 6, y + 4);
    ctx.lineTo(cx - 6, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', cx, y + 2);
    ctx.restore();
  }

  /**
   * 이름표.
   *
   * 부서 색을 **쓰지 않습니다.** 이름표 테두리·글자에 부서 색을 넣으면
   * 7가지 색이 화면에 동시에 떠서 게임 화면처럼 보입니다. 흰색 알약 +
   * 검정 글자 + 상태 점 하나로 통일하고, 색은 상태(작업/발언/완료)를
   * 알리는 데만 씁니다. 직책은 근접 카드가 보여주므로 여기선 생략합니다.
   */
  private drawNameTag(actor: Actor, cx: number, cy: number): void {
    const { ctx } = this;
    const label = actor.name;

    ctx.save();
    ctx.font = '600 11px "Pretendard Variable", Pretendard, system-ui, sans-serif';
    ctx.textAlign = 'center';

    const textW = ctx.measureText(label).width;
    const dotW = actor.status === 'idle' ? 0 : 11;
    const boxW = textW + 16 + dotW;

    // 그림자를 먼저 깔고 같은 자리를 다시 칠해 알약 경계를 또렷하게
    ctx.fillStyle = actor.isPlayer
      ? 'rgba(44,91,134,0.94)'
      : 'rgba(252,253,254,0.94)';
    ctx.shadowColor = 'rgba(10,16,24,0.28)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    roundRect(ctx, cx - boxW / 2, cy - 15, boxW, 17, 8.5);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fill();

    if (dotW > 0) {
      ctx.fillStyle = STATUS_COLOR[actor.status];
      ctx.beginPath();
      ctx.arc(cx - boxW / 2 + 10, cy - 6.5, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = actor.isPlayer ? '#ffffff' : '#1d2735';
    ctx.fillText(label, cx + dotW / 2, cy - 2.5);
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

  /** 미니맵용 — 매 15프레임마다 타일 좌표를 넘깁니다. */
  private reportPositions(): void {
    if (!this.callbacks.onActorPositions) return;

    this.positionTick += 1;
    if (this.positionTick % 15 !== 0) return;

    const next = new Map<string, { x: number; y: number; isPlayer: boolean }>();
    for (const [id, actor] of this.actors) {
      next.set(id, { x: actor.x, y: actor.y, isPlayer: actor.isPlayer });
    }
    this.callbacks.onActorPositions(next);
  }
}

const MOVE_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
]);

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
