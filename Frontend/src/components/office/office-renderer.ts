import type { Agent, AgentId, AgentStatus, SpeechEvent, ToolKind } from '@shared';
import {
  MAP_H,
  MAP_W,
  CEO_SEAT,
  DOORS,
  SPAWN,
  TILE,
  ZONES,
  MEETING_SEATS,
  findPath,
  isBlocked,
  nearestWalkable,
  zoneAt,
} from './office-map';
import { characterFrame, type SpriteAssets, type SpriteRect } from './sprites';
import { SPRITE_OF, STAFF_SEAT_MAP } from './office-staff';
import { buildCustomCeoSheet, type CustomAppearance, type CustomCeoSheet } from './custom-character';
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
 * 지수 감쇠 시상수(ms) — 값이 작을수록 목표값을 더 빨리 따라잡습니다.
 * 매 프레임 `factor = 1 - e^(-dt/tau)` 만큼 목표에 다가갑니다.
 */
const PLAYER_ACCEL_TAU_MS = 120;
const PLAYER_DECEL_TAU_MS = 100;
const CAMERA_TAU_MS = 100;
const ZOOM_TAU_MS = 120;
/**
 * 자리에서 타자 치는 느낌을 내는 프레임 순서.
 * 걷기 프레임(1, 3)을 번갈아 쓰면 팔이 미세하게 움직여 보입니다.
 */
const TYPING_FRAMES = [0, 1, 0, 3] as const;
/** 좌석 좌표는 이동용 발 위치이므로, 착석 렌더링은 의자 안쪽으로 올립니다. */
const SEATED_FOOT_LIFT = TILE * 0.58;
/** 착석·기립 전환 속도. 순간 이동하면 벽에 하체가 잘린 것처럼 보입니다. */
const SEATED_TRANSITION_SPEED = TILE * 3.4;

type LeisureKind = 'cafe' | 'lounge';

/**
 * 대기 직원이 잠깐 다녀오는 휴게 지점 (타일 좌표).
 * 카페·포커스 라운지·프로젝트 스튜디오 언저리의 빈 바닥입니다.
 * kind 는 어떤 연출(카페 김 파티클 등)을 붙일지 구분하는 데 씁니다.
 */
const LEISURE_POINTS: ReadonlyArray<{ x: number; y: number; kind: LeisureKind }> = [
  { x: 42, y: 26, kind: 'cafe' }, { x: 47, y: 26, kind: 'cafe' }, // 카페
  { x: 25, y: 12, kind: 'lounge' }, { x: 28, y: 12, kind: 'lounge' }, // 중앙 라운지
];

/** 배회 결정 간격 (ms) — 너무 잦으면 오피스가 산만해집니다 */
const CHAT_SPOTS = [
  [{ x: 42, y: 26 }, { x: 44, y: 26 }],
  [{ x: 25, y: 12 }, { x: 27, y: 12 }],
] as const;

const AMBIENT_CHAT_MIN_MS = 12_000;
const AMBIENT_CHAT_MAX_MS = 24_000;
const AMBIENT_CHAT_DURATION_MS = 11_000;
/** LLM 대사를 기다리는 최대 시간 — 초과하면 대화를 취소합니다 */
const AMBIENT_LINES_TIMEOUT_MS = 20_000;

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
  /** 타일/초 속도 벡터 — 가속·감속 보간에 씁니다 (플레이어만 실제로 씁니다) */
  vx: number;
  vy: number;
  /** 다음 배회 결정 시각 (대기 중일 때만 씀) */
  wanderAt?: number;
  /** 지금 휴게 공간에 나와 있는가 */
  atLeisure?: boolean;
  /** atLeisure 인 동안 어느 종류의 휴게 지점인지 — 카페면 김 파티클을 얹습니다 */
  leisureKind?: LeisureKind;
  ambientPartner?: AgentId;
  /** 이동 좌표와 별개인 착석 표시 높이 */
  seatedLift: number;
}

interface AmbientConversation {
  a: AgentId;
  b: AgentId;
  firstLine: string | null;
  secondLine: string | null;
  startedAt: number | null;
  replied: boolean;
  pairedAt: number;
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
  /** 휴게 대화 대사 — 백엔드 LLM 으로 생성합니다. 실패·불가 시 null */
  onRequestAmbientDialogue?: (
    agentA: AgentId,
    agentB: AgentId,
  ) => Promise<{ firstLine: string; secondLine: string } | null>;
  /** 카메라가 특정 직원을 따라가기 시작·중단할 때. null 이면 대표를 다시 비춥니다. */
  onFollowChange?: (agentId: AgentId | null) => void;
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
  /** 카메라가 지금 따라가는 직원 — 클릭-추적(Follow) 모드 */
  private followId: AgentId | null = null;
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
  /** 업무 세션 중에는 LLM 스몰토크를 시작하지 않습니다 */
  private ambientChatEnabled = true;
  /** 대표님 커스텀 외형 — 없으면(null) 공용 시트의 'ceo' 행을 그대로 씁니다 */
  private ceoOverride: CustomCeoSheet | null = null;

  private camX = 0;
  private camY = 0;
  private viewportW = 0;
  private viewportH = 0;
  private zoom = ZOOM_DEFAULT;
  private zoomTarget = ZOOM_DEFAULT;
  private baseZoom = ZOOM_DEFAULT;
  /** true 인 동안엔 카메라가 보간 없이 목표 위치로 즉시 붙습니다 (최초 진입·리사이즈용) */
  private cameraNeedsSnap = true;

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
      vx: 0, vy: 0,
      seatedLift: 0,
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
        vx: 0, vy: 0,
        seatedLift: SEATED_FOOT_LIFT,
      });
    }
  }


  /* ── 수명주기 ─────────────────────────────────── */

  start(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('dblclick', this.onDoubleClick);
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
    this.canvas.removeEventListener('dblclick', this.onDoubleClick);
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

  /** 터치 컨트롤도 키보드와 같은 이동 상태를 사용합니다. */
  setMoveKey(key: string, pressed: boolean): void {
    if (!MOVE_KEYS.has(key)) return;
    if (pressed) {
      this.keys.add(key);
      const player = this.actors.get('ceo');
      if (player) player.path = [];
      return;
    }
    this.keys.delete(key);
  }

  /** 표시 배율(%) 기준으로 확대/축소 — 목표만 바꾸고 실제 배율은 update 루프에서 애니메이션됩니다 */
  private adjustZoomPercent(deltaPercent: number): void {
    const currentPercent = Math.round((this.zoomTarget / this.baseZoom) * 100);
    const nextPercent = currentPercent + deltaPercent;
    this.setZoom((nextPercent / 100) * this.baseZoom);
  }

  /** 목표 배율을 설정합니다. 실제 `zoom` 값은 매 프레임 이 목표로 지수 감쇠하며 다가갑니다. */
  setZoom(next: number): void {
    this.zoomTarget = clamp(next, this.minZoom, ZOOM_MAX);
  }

  /** 목표 배율로 부드럽게 다가갑니다. 카메라 클램프는 updateCamera 가 매 프레임 새 배율 기준으로 다시 계산합니다. */
  private updateZoom(dt: number): void {
    const diff = this.zoomTarget - this.zoom;
    if (Math.abs(diff) < 0.0008) {
      if (this.zoom !== this.zoomTarget) {
        this.zoom = this.zoomTarget;
        this.callbacks.onZoomChange?.(this.zoom, this.baseZoom);
      }
      return;
    }
    const factor = 1 - Math.exp(-dt / ZOOM_TAU_MS);
    this.zoom += diff * factor;
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

  /** 업무 세션 중에는 false — Ollama 등 LLM 자원을 업무에 양보합니다 */
  setAmbientChatEnabled(enabled: boolean): void {
    this.ambientChatEnabled = enabled;
    if (!enabled && this.ambientConversation) this.finishAmbientConversation();
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

  /** 대표님 외형을 바꿉니다 — 즉석에서 새 시트를 그려 다음 프레임부터 바로 반영됩니다 */
  setCeoAppearance(appearance: CustomAppearance): void {
    const { frameWidth, frameHeight } = this.assets.manifest.characters;
    this.ceoOverride = buildCustomCeoSheet(appearance, frameWidth, frameHeight);
  }

  /** 커스텀 시트 안에서 (방향, 프레임) 위치를 계산합니다 — 단일 행(16칸) 레이아웃입니다 */
  private ceoOverrideFrame(sheet: CustomCeoSheet, direction: string, frame: number): SpriteRect | null {
    const dirIndex = Math.max(0, sheet.directions.indexOf(direction));
    const col = dirIndex * sheet.frames + (frame % sheet.frames);
    return { x: col * sheet.frameWidth, y: 0, w: sheet.frameWidth, h: sheet.frameHeight };
  }

  /* ── 입력 ─────────────────────────────────────── */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.isTyping(e.target)) return;
    if (MOVE_KEYS.has(e.key)) {
      this.keys.add(e.key);
      const player = this.actors.get('ceo');
      if (player) player.path = [];
      this.setFollow(null);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      this.setFollow(null);
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
    if (this.needsSize) return;

    const rect = this.canvas.getBoundingClientRect();
    const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);

    // 직원을 먼저 판정합니다. 직원 위를 눌렀는데 대표가 걸어가 버리면
    // "누른 것"과 "일어난 일"이 어긋나 보입니다.
    const hit = this.actorAt(tile.x, tile.y);
    if (hit) {
      this.setFollow(this.followId === hit ? null : hit);
      this.callbacks.onActorSelect?.(hit);
      return;
    }
    this.setFollow(null);
    this.callbacks.onActorSelect?.(null);
  };

  /** 클릭-추적 카메라 모드를 켜거나 끕니다 */
  private setFollow(id: AgentId | null): void {
    if (this.followId === id) return;
    this.followId = id;
    this.callbacks.onFollowChange?.(id);
  }

  /** 바깥(React)에서 "그만 보기"를 눌렀을 때 */
  stopFollow(): void {
    this.setFollow(null);
  }

  private onDoubleClick = (e: MouseEvent): void => {
    const player = this.actors.get('ceo');
    if (!player || this.needsSize || this.isTyping(e.target)) return;

    const rect = this.canvas.getBoundingClientRect();
    const tile = this.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
    if (this.actorAt(tile.x, tile.y)) return;

    const tx = Math.round(tile.x);
    const ty = Math.round(tile.y);

    if (isBlocked(tx, ty)) return;

    const path = findPath(player, { x: tx, y: ty });
    if (path.length === 0) return;

    player.path = path;
    this.marker = { x: tx, y: ty, at: performance.now() };
    this.setFollow(null);
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

    // 목적지 타일 자체가 막혀 있으면(좌석이 가구 충돌 박스와 겹치는 경우)
    // 벽을 뚫는 직선 대신 가장 가까운 걸을 수 있는 타일로 목적지를 옮깁니다.
    let goal = { x, y };
    if (isBlocked(x, y)) {
      const alt = nearestWalkable(x, y);
      if (!alt) {
        actor.path = [];
        return;
      }
      goal = alt;
    }

    // 경로를 못 찾으면(진짜로 막혀 있으면) 제자리에 둡니다 — 벽을 통과하는
    // 직선 이동으로 대신하지 않습니다.
    actor.path = findPath(actor, goal);
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

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      this.approachVelocity(actor, (dx / len) * PLAYER_SPEED, (dy / len) * PLAYER_SPEED, dt, PLAYER_ACCEL_TAU_MS);
      this.applyVelocity(actor, dt);
      return;
    }

    // 더블클릭 목적지 이동 중이면 경로를 그대로 따라갑니다 (경로 자체가 이미 부드럽습니다)
    if (actor.path.length > 0) {
      actor.vx = 0;
      actor.vy = 0;
      this.followPath(actor, dt, PLAYER_SPEED);
      return;
    }

    // 키를 뗀 순간 — 속도를 0으로 감쇠시켜 멈춥니다
    this.approachVelocity(actor, 0, 0, dt, PLAYER_DECEL_TAU_MS);
    this.applyVelocity(actor, dt);
  }

  /** 목표 속도로 지수 감쇠 — 프레임 속도와 무관하게 일정한 "무게감"을 냅니다 */
  private approachVelocity(actor: Actor, targetVx: number, targetVy: number, dt: number, tauMs: number): void {
    const factor = 1 - Math.exp(-dt / tauMs);
    actor.vx += (targetVx - actor.vx) * factor;
    actor.vy += (targetVy - actor.vy) * factor;
  }

  /** 현재 속도 벡터로 위치를 전진시킵니다 (축별 충돌 체크는 기존과 동일) */
  private applyVelocity(actor: Actor, dt: number): void {
    const speed = Math.hypot(actor.vx, actor.vy);
    if (speed < 0.02) {
      actor.vx = 0;
      actor.vy = 0;
      actor.moving = false;
      return;
    }

    const step = dt / 1000;
    const nx = actor.x + actor.vx * step;
    const ny = actor.y + actor.vy * step;

    if (this.canStand(nx, actor.y)) actor.x = nx;
    else actor.vx = 0;
    if (this.canStand(actor.x, ny)) actor.y = ny;
    else actor.vy = 0;

    actor.facing = Math.abs(actor.vx) > Math.abs(actor.vy)
      ? (actor.vx > 0 ? 'right' : 'left')
      : actor.vy > 0 ? 'down' : 'up';
    actor.moving = true;
    actor.distance += speed * step;
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
      this.updateSeatedLift(actor, dt);
    }
    this.updateZoom(dt);
    this.updateCamera(dt);
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
        if (!conversation.firstLine || !conversation.secondLine) {
          if (now - conversation.pairedAt >= AMBIENT_LINES_TIMEOUT_MS) {
            this.finishAmbientConversation();
          }
          return;
        }
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
        if (conversation.secondLine) {
          this.emitAmbientSpeech(conversation.b, conversation.a, conversation.secondLine);
        }
      }
      if (now - conversation.startedAt >= AMBIENT_CHAT_DURATION_MS) {
        this.finishAmbientConversation();
      }
      return;
    }

    if (this.meetingMode || now < this.ambientConversationAt || !this.ambientChatEnabled) return;
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
    if (!a || !b || !spot) return;

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
      firstLine: null,
      secondLine: null,
      startedAt: null,
      replied: false,
      pairedAt: now,
    };
    this.requestAmbientLines(a.id as AgentId, b.id as AgentId);
  }

  private requestAmbientLines(agentA: AgentId, agentB: AgentId): void {
    const request = this.callbacks.onRequestAmbientDialogue;
    if (!request) {
      this.finishAmbientConversation();
      return;
    }
    void request(agentA, agentB).then((lines) => {
      const conversation = this.ambientConversation;
      if (!conversation || conversation.a !== agentA || conversation.b !== agentB) return;
      if (!lines) {
        this.finishAmbientConversation();
        return;
      }
      conversation.firstLine = lines.firstLine;
      conversation.secondLine = lines.secondLine;
    });
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
      actor.leisureKind = undefined;
      if (actor.homeX !== undefined && actor.homeY !== undefined) {
        this.walkTo(actor, actor.homeX, actor.homeY);
      }
    } else {
      const spot = this.pickLeisure();
      if (spot) {
        actor.atLeisure = true;
        actor.leisureKind = spot.kind;
        this.walkTo(actor, spot.x, spot.y);
      }
    }
    actor.wanderAt = now + this.wanderDelay();
  }

  private wanderDelay(): number {
    return WANDER_MIN_MS + Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS);
  }

  private pickLeisure(): { x: number; y: number; kind: LeisureKind } | null {
    const start = Math.floor(Math.random() * LEISURE_POINTS.length);
    for (let i = 0; i < LEISURE_POINTS.length; i++) {
      const spot = LEISURE_POINTS[(start + i) % LEISURE_POINTS.length];
      if (spot && this.canStand(spot.x, spot.y)) return spot;
    }
    return null;
  }

  private updateCamera(dt: number): void {
    if (this.viewportW < 1) return;

    // Follow 모드면 지목한 직원을, 아니면 대표를 비춥니다.
    // 그 직원이 화면에서 사라지면(세션 종료 등) 자동으로 대표에게 돌아갑니다.
    let focus = this.followId ? this.actors.get(this.followId) : undefined;
    if (this.followId && !focus) this.setFollow(null);
    focus ??= this.actors.get('ceo');
    if (!focus) return;

    const foot = this.footPx(focus);
    const target = this.clampedTarget(foot.x - this.viewW / 2, foot.y - this.viewH / 2);

    // 최초 진입·리사이즈 직후는 화면이 원점부터 훑고 지나가지 않도록 즉시 붙입니다.
    // 그 외(팔로우 대상 전환 포함)에는 지수 감쇠로 부드럽게 따라갑니다.
    if (this.cameraNeedsSnap) {
      this.camX = target.x;
      this.camY = target.y;
      this.cameraNeedsSnap = false;
      return;
    }

    const factor = 1 - Math.exp(-dt / CAMERA_TAU_MS);
    this.camX += (target.x - this.camX) * factor;
    this.camY += (target.y - this.camY) * factor;
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
   * 카메라 목표 위치를 맵 안으로 제한합니다 (상태를 바꾸지 않는 순수 계산).
   * 시야가 맵보다 넓으면 맵을 가운데 정렬해 빈 여백이 한쪽으로 쏠리지 않게 합니다.
   */
  private clampedTarget(x: number, y: number): { x: number; y: number } {
    const { viewW, viewH } = this;

    const cx = viewW >= MAP_W ? (MAP_W - viewW) / 2 : clamp(x, 0, MAP_W - viewW);
    const cy = viewH >= MAP_H ? (MAP_H - viewH) / 2 : clamp(y, 0, MAP_H - viewH);

    return { x: cx, y: cy };
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
      this.zoomTarget = this.baseZoom;
      this.callbacks.onZoomChange?.(this.zoom, this.baseZoom);
    }
    // 리사이즈로 뷰포트가 바뀐 직후는 카메라가 애니메이션 없이 즉시 재정렬됩니다
    this.cameraNeedsSnap = true;
    this.updateCamera(0);
  }

  /* ── 좌표 변환 ────────────────────────────────── */

  private footPx(actor: Actor): { x: number; y: number } {
    return {
      x: actor.x * TILE + TILE / 2,
      y: actor.y * TILE + TILE - 2,
    };
  }

  /**
   * 맵의 좌석 좌표는 길찾기 도착점이라 앞쪽 벽 가까이에 있습니다.
   * 그대로 전신을 그리면 직원의 다리가 벽 위로 튀어나오므로,
   * 자기 자리에 멈춰 있는 동안에만 표시 기준점을 의자 쪽으로 올립니다.
   */
  private visualFootPx(actor: Actor): { x: number; y: number } {
    const foot = this.footPx(actor);
    return actor.seatedLift > 0 ? { x: foot.x, y: foot.y - actor.seatedLift } : foot;
  }

  private updateSeatedLift(actor: Actor, dt: number): void {
    const atHome = actor.homeX !== undefined && actor.homeY !== undefined &&
      Math.hypot(actor.x - actor.homeX, actor.y - actor.homeY) < 0.35;
    const shouldSit = !actor.isPlayer && actor.path.length === 0 && !actor.moving &&
      !actor.atLeisure && !actor.ambientPartner && atHome;
    const target = shouldSit ? SEATED_FOOT_LIFT : 0;
    const maxStep = (SEATED_TRANSITION_SPEED * dt) / 1000;
    const delta = target - actor.seatedLift;
    actor.seatedLift = Math.abs(delta) <= maxStep
      ? target
      : actor.seatedLift + Math.sign(delta) * maxStep;
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
    this.drawZoneTone();
    this.drawMeetingSpotlight();
    this.drawIdleZoneShade();
    this.drawDoors();
    this.drawDoorGlow();
    this.drawZoneLabels();
    this.drawCeoSeatMarker();

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
   * 미니맵에서만 쓰던 존별 고유색(`zone.color`)을 메인 캔버스에도 아주 옅게 깔아,
   * 바닥이 전부 같은 톤으로 보이지 않게 합니다. 정적 배경 위에 얹는 것이라
   * 알파를 낮게 잡아야 픽셀아트 색감을 해치지 않습니다.
   */
  private drawZoneTone(): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (const zone of ZONES) {
      ctx.fillStyle = zone.color;
      ctx.fillRect(zone.x * TILE, zone.y * TILE, zone.w * TILE, zone.h * TILE);
    }
    ctx.restore();
  }

  /** 회의가 진행 중이면 회의실 위에 맥동하는 따뜻한 스포트라이트를 얹습니다. */
  private drawMeetingSpotlight(): void {
    if (!this.meetingMode) return;

    const { ctx } = this;
    const pulse = 0.55 + Math.sin(performance.now() / 900) * 0.15;

    ctx.save();
    for (const zone of ZONES) {
      if (zone.kind !== 'meeting') continue;
      const cx = (zone.x + zone.w / 2) * TILE;
      const cy = (zone.y + zone.h / 2) * TILE;
      const radius = Math.max(zone.w, zone.h) * TILE * 0.62;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(255, 214, 150, ${0.22 * pulse})`);
      gradient.addColorStop(1, 'rgba(255, 214, 150, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(zone.x * TILE, zone.y * TILE, zone.w * TILE, zone.h * TILE);
    }
    ctx.restore();
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

  private drawCeoSeatMarker(): void {
    const { ctx } = this;
    const cx = CEO_SEAT.x * TILE + TILE / 2;
    const cy = CEO_SEAT.y * TILE + TILE - 3;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(108, 99, 255, 0.18)';
    ctx.strokeStyle = 'rgba(211, 208, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 15, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '800 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CEO', cx, cy + 2.5);
    ctx.restore();
  }

  /** 벽 방향에 맞춰 열린 통로·문틀·열린 문짝을 픽셀 스타일로 그립니다. */
  private drawDoors(): void {
    const { ctx } = this;
    ctx.save();
    for (const door of DOORS) {
      const zone = ZONES.find((candidate) => candidate.id === door.zoneId);
      if (!zone) continue;
      const x = door.x * TILE;
      const y = door.y * TILE;
      const right = zone.x + zone.w - 1;
      const bottom = zone.y + zone.h - 1;
      const vertical = door.x === zone.x || door.x === right;
      const side = door.y === zone.y
        ? 'top'
        : door.y === bottom
          ? 'bottom'
          : door.x === zone.x
            ? 'left'
            : 'right';

      ctx.fillStyle = '#18202a';
      ctx.strokeStyle = '#d3a15f';
      ctx.lineWidth = 2;

      if (vertical) {
        // 세로 벽의 문: 벽을 어두운 통로로 덮고 위·아래에 문틀을 둡니다.
        ctx.fillRect(x + 7, y + 2, 18, TILE - 4);
        ctx.fillStyle = '#b57d43';
        ctx.fillRect(x + 5, y + 1, 4, TILE - 2);
        ctx.fillRect(x + 23, y + 1, 4, TILE - 2);
        ctx.fillStyle = '#e1b66f';
        ctx.fillRect(x + 7, y + 2, 18, 3);
        ctx.fillRect(x + 7, y + TILE - 5, 18, 3);
        ctx.strokeStyle = '#d3a15f';
        ctx.beginPath();
        const hingeX = side === 'left' ? x + 24 : x + 8;
        const leafX = side === 'left' ? x + 15 : x + 17;
        ctx.moveTo(hingeX, y + 5);
        ctx.lineTo(leafX, y + 16);
        ctx.stroke();
      } else {
        // 가로 벽의 문: 좌·우 문설주와 열린 문짝이 통행 방향을 보여줍니다.
        ctx.fillRect(x + 2, y + 7, TILE - 4, 18);
        ctx.fillStyle = '#b57d43';
        ctx.fillRect(x + 1, y + 5, TILE - 2, 4);
        ctx.fillRect(x + 1, y + 23, TILE - 2, 4);
        ctx.fillStyle = '#e1b66f';
        ctx.fillRect(x + 2, y + 7, 3, 18);
        ctx.fillRect(x + TILE - 5, y + 7, 3, 18);
        ctx.strokeStyle = '#d3a15f';
        ctx.beginPath();
        const hingeY = side === 'top' ? y + 24 : y + 8;
        const leafY = side === 'top' ? y + 15 : y + 17;
        ctx.moveTo(x + 5, hingeY);
        ctx.lineTo(x + 16, leafY);
        ctx.stroke();
      }

      // 문 중앙의 밝은 문턱은 실제 통과 가능한 타일이라는 신호입니다.
      ctx.fillStyle = 'rgba(255, 231, 166, 0.68)';
      if (vertical) ctx.fillRect(x + 13, y + 5, 6, TILE - 10);
      else ctx.fillRect(x + 5, y + 13, TILE - 10, 6);
    }
    ctx.restore();
  }

  /**
   * 각 출입문 앞에 은은하게 숨 쉬는 따뜻한 빛 — 화분·램프 좌표가 없어도
   * 이미 정확히 맞는 문 좌표만으로 "공간에 온기가 있다"는 느낌을 냅니다.
   */
  private drawDoorGlow(): void {
    const { ctx } = this;
    const t = performance.now();

    ctx.save();
    for (const door of DOORS) {
      const cx = door.x * TILE + TILE / 2;
      const cy = door.y * TILE + TILE / 2;
      // 문마다 위상을 조금씩 어긋나게 해 전부 같이 맥동하지 않게 합니다
      const breathe = 0.5 + Math.sin(t / 1400 + door.x * 0.7 + door.y * 0.7) * 0.5;
      const radius = TILE * 1.1;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(255, 224, 168, ${0.16 + breathe * 0.1})`);
      gradient.addColorStop(1, 'rgba(255, 224, 168, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }

  private drawActor(actor: Actor): void {
    const { ctx, assets } = this;
    const { frameWidth, frameHeight } = assets.manifest.characters;
    const foot = this.visualFootPx(actor);

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

    // 대표님은 커스텀 외형이 있으면 공용 시트 대신 그 캔버스에서 그립니다
    const override = actor.isPlayer ? this.ceoOverride : null;
    const image = override ? override.canvas : assets.characters;
    const rect = override
      ? this.ceoOverrideFrame(override, facing, frame)
      : characterFrame(assets.manifest, actor.sprite, facing, frame);
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

    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, drawX, drawY, w, h);

    if (working) this.drawWorkingEffect(foot.x, drawY);
    if (talking) this.drawTalkingEffect(foot.x, drawY);
    if (done) this.drawDoneEffect(foot.x, drawY);
    if (idleSit) this.drawIdleEffect(foot.x, drawY, Boolean(actor.atLeisure), actor.leisureKind);
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

  /**
   * 진짜 유휴 — 자리를 비웠을 때만 위트 있게 보여줍니다.
   * 일하는 중(ambientWorking)에는 뜨지 않습니다 — 작업·발언·완료처럼
   * "지금 상태"를 알리는 용도지, 캐릭터마다 붙는 장식이 아닙니다.
   */
  private drawIdleEffect(cx: number, topY: number, atLeisure: boolean, leisureKind?: LeisureKind): void {
    const { ctx } = this;
    const y = topY - 14;
    const icon = atLeisure ? '☕' : '💤';

    ctx.save();
    ctx.fillStyle = '#fcfdfe';
    ctx.strokeStyle = 'rgba(20,30,40,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = '11px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, cx, y + 1);
    ctx.restore();

    if (leisureKind === 'cafe') this.drawSteam(cx, y - 9);
  }

  /** 카페에서 쉬는 중일 때 뱃지 위로 피어오르는 김 세 줄기 */
  private drawSteam(cx: number, topY: number): void {
    const { ctx } = this;
    const t = performance.now() / 1000;

    ctx.save();
    for (let i = 0; i < 3; i++) {
      const phase = (t * 0.55 + i / 3) % 1;
      const rise = phase * 14;
      const drift = Math.sin(phase * Math.PI * 2 + i) * 2.2;
      ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.45;
      ctx.fillStyle = '#f4ece0';
      ctx.beginPath();
      ctx.arc(cx - 4 + i * 4 + drift, topY - rise, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 도구 사용 — 이름표 위에 작은 뱃지 */
  private drawToolBadge(cx: number, topY: number, tool: ToolKind): void {
    const { ctx } = this;
    const y = topY - 28;
    const label = tool === 'vault' ? 'V' : tool === 'web-search' ? 'S' : 'F';
    const color = tool === 'vault' ? '#8b7355' : tool === 'web-search' ? '#4a90e2' : '#3f857d';

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

    // 말풍선은 코너에 고정된 UI(미니맵·단축키 안내·사이드바)와 겹치지 않도록
    // 화면 가장자리에서 일정 여백 안쪽으로만 표시합니다.
    const marginX = 170;
    const topMargin = 90;
    const bottomMargin = 170;

    for (const id of this.anchorTargets) {
      const actor = this.actors.get(id);
      if (!actor) continue;
      const foot = this.visualFootPx(actor);
      const point = {
        left: clamp((foot.x - this.camX) * this.zoom, marginX, Math.max(marginX, this.viewportW - marginX)),
        top: clamp((foot.y - this.camY) * this.zoom - 58, topMargin, Math.max(topMargin, this.viewportH - bottomMargin)),
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
