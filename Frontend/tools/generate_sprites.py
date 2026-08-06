#!/usr/bin/env python3
"""
메타버스 오피스 스프라이트 생성기.

ZEP·게더타운 계열의 탑다운 오피스 룩을 목표로, 캐릭터 시트와 타일·가구를
전부 코드로 그려 PNG 로 내보냅니다. 외부 에셋을 받지 않으므로 저작권 문제가 없고,
색상·비율을 바꾸고 싶으면 이 파일만 고치면 됩니다.

실행:
    python Frontend/tools/generate_sprites.py

출력:
    Frontend/public/sprites/characters.png   캐릭터 시트 (8명 × 4방향 × 4프레임)
    Frontend/public/sprites/tiles.png        바닥·벽·카펫 타일 아틀라스
    Frontend/public/sprites/props.png        가구 아틀라스
    Frontend/public/sprites/manifest.json    좌표 매니페스트
"""

from __future__ import annotations

import json
import os
from PIL import Image, ImageDraw

# ── 규격 ────────────────────────────────────────────────
TILE = 32
CHAR_W, CHAR_H = 32, 48
DIRECTIONS = ["down", "left", "right", "up"]
FRAMES = 4  # idle, step1, idle, step2

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "sprites")


# ── 색 유틸 ─────────────────────────────────────────────
def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def shade(color: tuple[int, int, int], amount: int) -> tuple[int, int, int]:
    return tuple(max(0, min(255, c + amount)) for c in color)  # type: ignore[return-value]


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))  # type: ignore[return-value]


# ── 캐릭터 정의 (백엔드 시드와 색을 맞춥니다) ───────────
CHARACTERS = [
    # id,          셔츠색,     머리색,     피부색
    ("ceo",        "#e8e8ef", "#3a2c1f", "#f2cba3"),
    ("chief",      "#f2c14e", "#2a2118", "#f0c9a0"),
    ("planner",    "#5aa9e6", "#1f1a14", "#e8bd94"),
    ("researcher", "#9b5de5", "#4a2f1c", "#f3d0ab"),
    ("marketer",   "#ef476f", "#5c3317", "#f0c9a0"),
    ("dev",        "#06d6a0", "#232323", "#e0b088"),
    ("finance",    "#118ab2", "#33241a", "#f2cba3"),
    ("writer",     "#ff9f1c", "#6b4423", "#f5d5b0"),
]

TROUSERS = hex_rgb("#39404f")
SHOES = hex_rgb("#22262f")
OUTLINE = hex_rgb("#1a1d24")


def draw_character(
    draw: ImageDraw.ImageDraw,
    ox: int,
    oy: int,
    shirt: tuple[int, int, int],
    hair: tuple[int, int, int],
    skin: tuple[int, int, int],
    direction: str,
    frame: int,
) -> None:
    """
    32×48 칸 하나에 캐릭터 한 포즈를 그립니다. 발밑이 (16, 46) 기준.

    방향이 한눈에 구분되어야 하므로 실루엣 자체를 바꿉니다.
      down  정면 — 두 눈 + 앞머리
      up    뒤통수 — 얼굴 없음, 머리카락이 뒷목까지
      left  좌측면 — 폭이 좁고 코가 왼쪽으로 튀어나옴, 눈 하나
      right 우측면 — 좌측면의 거울상
    """
    # 걷기 프레임 → 다리·팔 오프셋 (0·2 정지, 1 왼발, 3 오른발)
    swing = {0: 0, 1: 2, 2: 0, 3: -2}[frame]
    side_view = direction in ("left", "right")
    facing = -1 if direction == "left" else 1  # 측면일 때 바라보는 쪽

    cx = ox + 16
    head_top = oy + 7
    head_bottom = oy + 21
    # 측면은 몸이 좁아 보이게
    half_w = 5 if side_view else 7

    # ── 발밑 그림자
    draw.ellipse([cx - 8, oy + 42, cx + 8, oy + 47], fill=(0, 0, 0, 70))

    # ── 다리 + 신발
    if side_view:
        # 앞다리 / 뒷다리로 겹쳐 그려 측면 느낌을 냅니다
        for depth, lift in ((0, -swing), (1, swing)):
            lx = cx - 3 + depth * 2
            leg = TROUSERS if depth else shade(TROUSERS, -18)
            draw.rectangle([lx, oy + 33, lx + 4, oy + 42 + lift], fill=leg)
            draw.rectangle(
                [lx - (2 if facing < 0 else 0), oy + 42 + lift, lx + 4 + (2 if facing > 0 else 0), oy + 45 + lift],
                fill=SHOES if depth else shade(SHOES, -14),
            )
    else:
        for sign in (-1, 1):
            lift = swing if sign < 0 else -swing
            lx = cx + sign * 4
            draw.rectangle([lx - 3, oy + 33, lx + 2, oy + 42 + lift], fill=TROUSERS)
            draw.rectangle([lx - 3, oy + 42 + lift, lx + 2, oy + 45 + lift], fill=SHOES)

    # ── 몸통 (셔츠)
    body_top = oy + 22
    draw.rectangle([cx - half_w, body_top, cx + half_w - 1, oy + 35], fill=shirt)
    draw.rectangle([cx - half_w, oy + 32, cx + half_w - 1, oy + 35], fill=shade(shirt, -24))
    draw.rectangle([cx - half_w, body_top, cx + half_w - 1, body_top + 2], fill=shade(shirt, 18))

    if direction == "down":
        # 옷깃
        draw.rectangle([cx - 2, body_top, cx + 1, body_top + 3], fill=shade(shirt, -30))
    elif direction == "up":
        # 등판 이음새
        draw.line([(cx, body_top + 1), (cx, oy + 34)], fill=shade(shirt, -16))

    # ── 팔
    if side_view:
        # 앞쪽 팔 하나만 크게 흔들립니다
        ax = cx + facing * 3
        draw.rectangle([ax - 2, oy + 23, ax + 2, oy + 32 + swing], fill=shade(shirt, -14))
        draw.rectangle([ax - 2, oy + 32 + swing, ax + 2, oy + 35 + swing], fill=skin)
    else:
        for sign in (-1, 1):
            offset = -swing if sign < 0 else swing
            ax = cx + sign * 8
            draw.rectangle([ax - 1, oy + 23, ax + 1, oy + 32 + offset], fill=shade(shirt, -12))
            draw.rectangle([ax - 1, oy + 32 + offset, ax + 1, oy + 34 + offset], fill=skin)

    # ── 목
    draw.rectangle([cx - 2, oy + 20, cx + 1, oy + 23], fill=shade(skin, -28))

    # ── 머리
    if side_view:
        # 측면 — 폭 11px, 바라보는 쪽으로 살짝 치우침
        hx0 = cx - 5 + facing
        hx1 = cx + 5 + facing
        draw.rectangle([hx0, head_top, hx1, head_bottom], fill=skin)
        draw.rectangle([hx0, head_bottom - 2, hx1, head_bottom], fill=shade(skin, -18))
        # 코 — 바라보는 방향으로 1px 돌출
        nose_x = hx0 - 1 if facing < 0 else hx1 + 1
        draw.rectangle([nose_x, oy + 15, nose_x, oy + 17], fill=shade(skin, -26))
        # 머리카락 — 뒤통수를 덮음
        draw.rectangle([hx0, head_top - 1, hx1, head_top + 4], fill=hair)
        if facing < 0:
            draw.rectangle([hx1 - 3, head_top - 1, hx1, oy + 19], fill=hair)
        else:
            draw.rectangle([hx0, head_top - 1, hx0 + 3, oy + 19], fill=hair)
        # 귀
        ear_x = cx + (2 if facing < 0 else -3)
        draw.rectangle([ear_x, oy + 15, ear_x + 1, oy + 17], fill=shade(skin, -22))
        # 눈 하나
        eye_x = hx0 + 1 if facing < 0 else hx1 - 2
        draw.rectangle([eye_x, oy + 15, eye_x + 1, oy + 17], fill=OUTLINE)

    elif direction == "up":
        # 뒤통수 — 얼굴이 전혀 보이지 않습니다
        draw.rectangle([cx - 7, head_top - 1, cx + 6, head_bottom], fill=hair)
        draw.rectangle([cx - 7, head_bottom - 2, cx + 6, head_bottom], fill=shade(hair, -18))
        draw.rectangle([cx - 5, head_top, cx + 4, head_top + 2], fill=shade(hair, 22))

    else:  # down
        draw.rectangle([cx - 7, head_top, cx + 6, head_bottom], fill=skin)
        draw.rectangle([cx - 7, head_bottom - 2, cx + 6, head_bottom], fill=shade(skin, -18))
        # 앞머리
        draw.rectangle([cx - 7, head_top - 1, cx + 6, head_top + 4], fill=hair)
        draw.rectangle([cx - 7, head_top - 1, cx - 4, oy + 15], fill=hair)
        draw.rectangle([cx + 3, head_top - 1, cx + 6, oy + 15], fill=hair)
        # 두 눈 + 입
        draw.rectangle([cx - 5, oy + 15, cx - 4, oy + 17], fill=OUTLINE)
        draw.rectangle([cx + 3, oy + 15, cx + 4, oy + 17], fill=OUTLINE)
        draw.rectangle([cx - 1, oy + 18, cx, oy + 18], fill=shade(skin, -40))


def build_characters() -> tuple[Image.Image, dict]:
    cols = len(DIRECTIONS) * FRAMES
    rows = len(CHARACTERS)
    sheet = Image.new("RGBA", (cols * CHAR_W, rows * CHAR_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sheet, "RGBA")

    index: dict[str, int] = {}
    for row, (char_id, shirt, hair, skin) in enumerate(CHARACTERS):
        index[char_id] = row
        for d, direction in enumerate(DIRECTIONS):
            for frame in range(FRAMES):
                col = d * FRAMES + frame
                draw_character(
                    draw,
                    col * CHAR_W,
                    row * CHAR_H,
                    hex_rgb(shirt),
                    hex_rgb(hair),
                    hex_rgb(skin),
                    direction,
                    frame,
                )

    meta = {
        "frameWidth": CHAR_W,
        "frameHeight": CHAR_H,
        "directions": DIRECTIONS,
        "frames": FRAMES,
        "rows": index,
    }
    return sheet, meta


# ── 타일 (바닥·벽·카펫) ─────────────────────────────────
# oVice·ZEP 처럼 밝고 깨끗한 사무실 톤
TILE_NAMES = [
    "floor_wood",
    "floor_tile",
    "carpet",
    "wall_face",
    "wall_top",
    "rug_edge",
    "glass",
]


def draw_floor_wood(d: ImageDraw.ImageDraw, ox: int, oy: int) -> None:
    """밝은 원목 마루 — 부스 바닥. 판재를 넓게 잡아 벽돌처럼 보이지 않게 합니다."""
    base = hex_rgb("#efe0c6")
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], fill=base)

    # 판재 경계는 16px 간격으로만 (얇고 연하게)
    for y in (0, 16):
        d.line([(ox, oy + y), (ox + TILE - 1, oy + y)], fill=shade(base, -13))

    # 나뭇결 — 아주 옅은 가로 선
    for y, tone in ((4, -5), (9, 4), (20, -5), (26, 4)):
        d.line([(ox + 2, oy + y), (ox + TILE - 3, oy + y)], fill=shade(base, tone))

    # 판재 이음매는 엇갈리게 딱 두 곳만
    d.line([(ox + 20, oy), (ox + 20, oy + 15)], fill=shade(base, -16))
    d.line([(ox + 8, oy + 16), (ox + 8, oy + TILE - 1)], fill=shade(base, -16))


def draw_floor_tile(d: ImageDraw.ImageDraw, ox: int, oy: int) -> None:
    """연회색 타일 — 오픈 플로어 기본 바닥 (헤링본 느낌의 결)"""
    base = hex_rgb("#eef1f5")
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], fill=base)
    grain = shade(base, -8)
    for i in range(0, TILE, 8):
        d.line([(ox + i, oy), (ox + i + 7, oy + 7)], fill=grain)
        d.line([(ox + i, oy + 16), (ox + i + 7, oy + 23)], fill=grain)
        d.line([(ox + i + 7, oy + 8), (ox + i, oy + 15)], fill=grain)
        d.line([(ox + i + 7, oy + 24), (ox + i, oy + 31)], fill=grain)
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], outline=shade(base, -12))


def draw_carpet(d: ImageDraw.ImageDraw, ox: int, oy: int) -> None:
    """흰색으로 그려두고 렌더러에서 부서 색으로 물들입니다."""
    base = (255, 255, 255)
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], fill=base)
    for y in range(0, TILE, 4):
        for x in range(0, TILE, 4):
            if (x + y) % 8 == 0:
                d.point((ox + x, oy + y), fill=(236, 236, 236))


def draw_rug_edge(d: ImageDraw.ImageDraw, ox: int, oy: int) -> None:
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], fill=(255, 255, 255))
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], outline=(228, 228, 228))


def draw_wall_face(d: ImageDraw.ImageDraw, ox: int, oy: int) -> None:
    """벽의 정면(아래쪽) — 흰 벽에 걸레받이"""
    base = hex_rgb("#f4f6f9")
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], fill=base)
    d.rectangle([ox, oy, ox + TILE - 1, oy + 2], fill=shade(base, -18))  # 위쪽 그림자선
    d.rectangle([ox, oy + TILE - 5, ox + TILE - 1, oy + TILE - 1], fill=hex_rgb("#d4dae3"))
    d.rectangle([ox, oy + TILE - 2, ox + TILE - 1, oy + TILE - 1], fill=hex_rgb("#b9c2ce"))


def draw_wall_top(d: ImageDraw.ImageDraw, ox: int, oy: int) -> None:
    """벽의 윗면 — 위에서 내려다본 두께"""
    base = hex_rgb("#cfd7e1")
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], fill=base)
    d.rectangle([ox, oy, ox + TILE - 1, oy + 1], fill=shade(base, 16))
    d.rectangle([ox, oy + TILE - 2, ox + TILE - 1, oy + TILE - 1], fill=shade(base, -20))


def draw_glass(d: ImageDraw.ImageDraw, ox: int, oy: int) -> None:
    """미팅 부스의 유리 파티션"""
    d.rectangle([ox, oy, ox + TILE - 1, oy + TILE - 1], fill=(178, 214, 233, 130))
    d.rectangle([ox, oy, ox + TILE - 1, oy + 2], fill=hex_rgb("#9fb6c6"))
    d.rectangle([ox, oy + TILE - 3, ox + TILE - 1, oy + TILE - 1], fill=hex_rgb("#9fb6c6"))
    d.line([(ox + 6, oy + 4), (ox + 2, oy + TILE - 5)], fill=(255, 255, 255, 150), width=2)
    d.line([(ox + 18, oy + 4), (ox + 14, oy + TILE - 5)], fill=(255, 255, 255, 110), width=2)


TILE_DRAWERS = {
    "floor_wood": draw_floor_wood,
    "floor_tile": draw_floor_tile,
    "carpet": draw_carpet,
    "wall_face": draw_wall_face,
    "wall_top": draw_wall_top,
    "rug_edge": draw_rug_edge,
    "glass": draw_glass,
}


def build_tiles() -> tuple[Image.Image, dict]:
    sheet = Image.new("RGBA", (TILE * len(TILE_NAMES), TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(sheet, "RGBA")
    index = {}
    for i, name in enumerate(TILE_NAMES):
        TILE_DRAWERS[name](d, i * TILE, 0)
        index[name] = {"x": i * TILE, "y": 0, "w": TILE, "h": TILE}
    return sheet, {"tileSize": TILE, "tiles": index}


# ── 가구 ────────────────────────────────────────────────
# (이름, 폭, 높이) — 높이가 32를 넘으면 위로 솟은 입체물
PROPS: list[tuple[str, int, int]] = [
    ("desk", 64, 40),
    ("desk_v", 40, 64),
    ("chair", 32, 34),
    ("chair_up", 32, 34),
    ("plant", 32, 48),
    ("bookshelf", 64, 52),
    ("whiteboard", 64, 44),
    ("meeting_table", 160, 96),
    ("sofa", 96, 44),
    ("cooler", 32, 46),
    ("lamp", 32, 52),
    ("server_rack", 32, 56),
    ("coffee_table", 64, 36),
    ("door_mat", 64, 24),
    # ── 오픈 플로어용
    ("workstation", 64, 56),   # ZEP 식 1인 워크스테이션 (책상+모니터+의자)
    ("round_table", 96, 80),   # 라운지 원형 테이블 + 의자 4개
    ("long_table", 224, 96),   # 대형 회의 테이블
    ("cluster_desk", 128, 96), # 각진 4인 데스크 클러스터
    ("printer", 32, 44),
    ("partition", 64, 28),     # 낮은 파티션
]

# 밝은 사무실 팔레트
WOOD = hex_rgb("#d9b98c")
WOOD_DARK = hex_rgb("#b08a5c")
TOP_WHITE = hex_rgb("#fbfcfd")
TOP_EDGE = hex_rgb("#dfe5ec")
METAL = hex_rgb("#8b96a6")
METAL_LIGHT = hex_rgb("#b7c0cc")
SCREEN = hex_rgb("#37455c")
SCREEN_GLOW = hex_rgb("#7fa6d6")
MINT = hex_rgb("#a8dcc4")
MINT_DARK = hex_rgb("#7cbfa4")
LEAF = hex_rgb("#5cb677")
SHADOW = (140, 150, 165, 55)


def _shadow(d: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int) -> None:
    d.ellipse([x0, y0, x1, y1], fill=SHADOW)


def _monitor(d: ImageDraw.ImageDraw, mx: int, my: int, scale: int = 1) -> None:
    """위에서 살짝 내려다본 모니터"""
    w = 13 * scale
    h = 11 * scale
    d.rounded_rectangle([mx - w, my, mx + w, my + h], radius=2, fill=METAL)
    d.rounded_rectangle([mx - w + 2, my + 2, mx + w - 2, my + h - 2], radius=1, fill=SCREEN)
    d.rectangle([mx - w + 3, my + 3, mx - 2, my + 5], fill=SCREEN_GLOW)
    d.rectangle([mx - w + 3, my + 6, mx + 3, my + 7], fill=shade(SCREEN_GLOW, -30))
    d.rectangle([mx - 2, my + h, mx + 1, my + h + 4], fill=METAL_LIGHT)
    d.rectangle([mx - 6, my + h + 4, mx + 5, my + h + 6], fill=METAL)


def prop_desk(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    top = oy + 8
    _shadow(d, ox + 2, oy + h - 9, ox + w - 3, oy + h - 1)
    d.rectangle([ox + 2, top + 12, ox + w - 3, oy + h - 6], fill=WOOD_DARK)   # 측면
    d.rounded_rectangle([ox, top, ox + w - 1, top + 14], radius=3, fill=TOP_WHITE)
    d.rounded_rectangle([ox, top, ox + w - 1, top + 14], radius=3, outline=TOP_EDGE)
    d.rectangle([ox + 2, top + 12, ox + w - 3, top + 14], fill=TOP_EDGE)
    mx = ox + w // 2
    _monitor(d, mx, oy)
    d.rounded_rectangle([mx - 10, top + 16, mx + 9, top + 21], radius=2, fill=METAL_LIGHT)


def prop_desk_v(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 2, oy + h - 9, ox + w - 3, oy + h - 1)
    d.rectangle([ox + 3, oy + 20, ox + w - 4, oy + h - 6], fill=WOOD_DARK)
    d.rounded_rectangle([ox + 1, oy + 8, ox + w - 2, oy + h - 14], radius=3, fill=TOP_WHITE)
    d.rounded_rectangle([ox + 1, oy + 8, ox + w - 2, oy + h - 14], radius=3, outline=TOP_EDGE)
    _monitor(d, ox + w // 2, oy)


def prop_chair(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int, back_top: bool) -> None:
    """민트색 사무용 의자 (위에서 본 모습)"""
    _shadow(d, ox + 5, oy + h - 8, ox + w - 6, oy + h - 1)
    if back_top:
        d.rounded_rectangle([ox + 6, oy + 2, ox + w - 7, oy + 13], radius=4, fill=MINT_DARK)
        d.rounded_rectangle([ox + 4, oy + 11, ox + w - 5, oy + 25], radius=5, fill=MINT)
    else:
        d.rounded_rectangle([ox + 4, oy + 9, ox + w - 5, oy + 23], radius=5, fill=MINT)
        d.rounded_rectangle([ox + 6, oy + 20, ox + w - 7, oy + 31], radius=4, fill=MINT_DARK)
    d.rectangle([ox + 14, oy + 24, ox + 17, oy + h - 5], fill=METAL)
    d.ellipse([ox + 10, oy + h - 8, ox + w - 11, oy + h - 3], fill=METAL_LIGHT)


def prop_plant(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    pot = hex_rgb("#e8e2d6")
    _shadow(d, ox + 4, oy + h - 8, ox + w - 5, oy + h - 1)
    d.polygon(
        [(ox + 8, oy + 30), (ox + w - 9, oy + 30), (ox + w - 12, oy + h - 4), (ox + 11, oy + h - 4)],
        fill=pot,
    )
    d.rectangle([ox + 8, oy + 30, ox + w - 9, oy + 33], fill=shade(pot, 20))
    for cx, cy, r in ((16, 20, 9), (9, 25, 6), (23, 25, 6), (16, 11, 7)):
        d.ellipse([ox + cx - r, oy + cy - r, ox + cx + r, oy + cy + r], fill=LEAF)
    for cx, cy, r in ((14, 17, 4), (20, 23, 3)):
        d.ellipse([ox + cx - r, oy + cy - r, ox + cx + r, oy + cy + r], fill=shade(LEAF, 26))


def prop_bookshelf(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 2, oy + h - 7, ox + w - 3, oy + h - 1)
    d.rounded_rectangle([ox, oy, ox + w - 1, oy + h - 5], radius=2, fill=WOOD)
    d.rectangle([ox + 3, oy + 3, ox + w - 4, oy + h - 8], fill=hex_rgb("#f3ece0"))
    shelf_colors = ["#e07a68", "#6f9ede", "#e3bf55", "#6fc094", "#a982da"]
    for row in range(3):
        y = oy + 6 + row * 14
        d.rectangle([ox + 3, y + 10, ox + w - 4, y + 12], fill=WOOD)
        for i in range(9):
            bx = ox + 6 + i * 6
            if bx + 4 > ox + w - 5:
                break
            col = hex_rgb(shelf_colors[(row * 3 + i) % len(shelf_colors)])
            d.rectangle([bx, y + 1, bx + 4, y + 9], fill=col)


def prop_whiteboard(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 4, oy + h - 7, ox + w - 5, oy + h - 1)
    d.rounded_rectangle([ox, oy, ox + w - 1, oy + h - 10], radius=3, fill=hex_rgb("#ffffff"))
    d.rounded_rectangle([ox, oy, ox + w - 1, oy + h - 10], radius=3, outline=METAL_LIGHT, width=2)
    ink = hex_rgb("#6f83a3")
    d.line([(ox + 8, oy + 10), (ox + 30, oy + 10)], fill=ink, width=2)
    d.line([(ox + 8, oy + 16), (ox + 44, oy + 16)], fill=ink, width=2)
    d.line([(ox + 8, oy + 22), (ox + 24, oy + 22)], fill=hex_rgb("#e08585"), width=2)
    d.rectangle([ox + 12, oy + h - 12, ox + 15, oy + h - 4], fill=METAL)
    d.rectangle([ox + w - 16, oy + h - 12, ox + w - 13, oy + h - 4], fill=METAL)


def _table_top(d: ImageDraw.ImageDraw, box: list[int], radius: int) -> None:
    """밝은 원목 상판 + 두께"""
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0, y0 + 8, x1, y1], radius=radius, fill=WOOD_DARK)
    d.rounded_rectangle([x0, y0, x1, y1 - 8], radius=radius, fill=WOOD)
    d.rounded_rectangle([x0 + 6, y0 + 5, x1 - 6, y1 - 14], radius=radius, fill=shade(WOOD, 12))


def prop_meeting_table(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 6, oy + 20, ox + w - 7, oy + h - 2)
    d.ellipse([ox + 4, oy + 12, ox + w - 5, oy + h - 6], fill=WOOD_DARK)
    d.ellipse([ox + 4, oy + 4, ox + w - 5, oy + h - 14], fill=WOOD)
    d.ellipse([ox + 18, oy + 11, ox + w - 19, oy + h - 25], fill=shade(WOOD, 13))
    for cx, cy in ((40, 30), (96, 40)):
        d.rounded_rectangle([ox + cx, oy + cy, ox + cx + 20, oy + cy + 13], radius=2, fill=(255, 255, 255))
    for cx, cy in ((72, 26), (86, 52)):
        d.ellipse([ox + cx, oy + cy, ox + cx + 9, oy + cy + 9], fill=(255, 255, 255))
        d.ellipse([ox + cx + 2, oy + cy + 2, ox + cx + 7, oy + cy + 7], fill=hex_rgb("#8a6142"))


def prop_sofa(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    fabric = hex_rgb("#c8d3e2")
    _shadow(d, ox + 4, oy + h - 8, ox + w - 5, oy + h - 1)
    d.rounded_rectangle([ox + 2, oy + 2, ox + w - 3, oy + 19], radius=4, fill=shade(fabric, 14))
    d.rounded_rectangle([ox, oy + 14, ox + w - 1, oy + h - 6], radius=5, fill=fabric)
    d.rounded_rectangle([ox, oy + 14, ox + 11, oy + h - 6], radius=4, fill=shade(fabric, -14))
    d.rounded_rectangle([ox + w - 12, oy + 14, ox + w - 1, oy + h - 6], radius=4, fill=shade(fabric, -14))
    for i in range(2):
        cx = ox + 18 + i * 32
        d.rounded_rectangle([cx, oy + 18, cx + 26, oy + 31], radius=3, fill=shade(fabric, 8))


def prop_cooler(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 5, oy + h - 7, ox + w - 6, oy + h - 1)
    d.rounded_rectangle([ox + 8, oy + 16, ox + w - 9, oy + h - 4], radius=2, fill=(255, 255, 255))
    d.rounded_rectangle([ox + 10, oy + 2, ox + w - 11, oy + 18], radius=3, fill=hex_rgb("#a9dcf5"))
    d.rectangle([ox + 12, oy + 4, ox + w - 15, oy + 14], fill=hex_rgb("#cfeeff"))
    d.rectangle([ox + 12, oy + 26, ox + w - 13, oy + 30], fill=METAL_LIGHT)


def prop_lamp(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 8, oy + h - 7, ox + w - 9, oy + h - 1)
    d.polygon(
        [(ox + 6, oy + 18), (ox + w - 7, oy + 18), (ox + w - 11, oy + 2), (ox + 10, oy + 2)],
        fill=hex_rgb("#fbf1d6"),
    )
    d.rectangle([ox + 14, oy + 18, ox + 17, oy + h - 6], fill=METAL_LIGHT)
    d.ellipse([ox + 9, oy + h - 10, ox + w - 10, oy + h - 4], fill=METAL)


def prop_server_rack(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 3, oy + h - 7, ox + w - 4, oy + h - 1)
    d.rounded_rectangle([ox + 2, oy + 2, ox + w - 3, oy + h - 4], radius=2, fill=hex_rgb("#5c6675"))
    for row in range(7):
        y = oy + 6 + row * 7
        d.rectangle([ox + 5, y, ox + w - 6, y + 4], fill=hex_rgb("#78838f"))
        led = hex_rgb("#5ce89b") if row % 2 == 0 else hex_rgb("#ffc861")
        d.rectangle([ox + w - 10, y + 1, ox + w - 8, y + 3], fill=led)


def prop_coffee_table(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 4, oy + h - 8, ox + w - 5, oy + h - 1)
    d.rectangle([ox + 8, oy + 18, ox + w - 9, oy + h - 5], fill=WOOD_DARK)
    _table_top(d, [ox + 2, oy + 4, ox + w - 3, oy + 24], 5)
    d.rounded_rectangle([ox + 22, oy + 9, ox + 42, oy + 17], radius=2, fill=(255, 255, 255))


def prop_door_mat(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    d.rounded_rectangle([ox + 2, oy + 4, ox + w - 3, oy + h - 4], radius=4, fill=hex_rgb("#bcd3e6"))
    d.rounded_rectangle([ox + 6, oy + 8, ox + w - 7, oy + h - 8], radius=3, outline=hex_rgb("#9dbcd6"))


def prop_workstation(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    """ZEP 식 1인 워크스테이션 — 책상 + 모니터 + 의자 + 서랍"""
    _shadow(d, ox + 4, oy + h - 9, ox + w - 5, oy + h - 2)
    # 책상
    d.rectangle([ox + 4, oy + 20, ox + w - 5, oy + 26], fill=WOOD_DARK)
    d.rounded_rectangle([ox + 2, oy + 8, ox + w - 3, oy + 22], radius=3, fill=TOP_WHITE)
    d.rounded_rectangle([ox + 2, oy + 8, ox + w - 3, oy + 22], radius=3, outline=TOP_EDGE)
    _monitor(d, ox + 22, oy)
    # 서랍장
    d.rounded_rectangle([ox + w - 16, oy + 10, ox + w - 4, oy + 26], radius=2, fill=hex_rgb("#e9eef4"))
    d.rectangle([ox + w - 13, oy + 14, ox + w - 7, oy + 15], fill=METAL)
    d.rectangle([ox + w - 13, oy + 20, ox + w - 7, oy + 21], fill=METAL)
    # 의자
    prop_chair(d, ox + 6, oy + 22, 32, 34, back_top=True)


def prop_round_table(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    """라운지 원형 테이블 + 의자 4개"""
    cx, cy = ox + w // 2, oy + h // 2
    for dx, dy in ((-32, 0), (32, 0), (0, -26), (0, 24)):
        d.rounded_rectangle(
            [cx + dx - 10, cy + dy - 9, cx + dx + 10, cy + dy + 9], radius=5, fill=MINT
        )
        d.rounded_rectangle(
            [cx + dx - 8, cy + dy - 7, cx + dx + 8, cy + dy + 7], radius=4, fill=MINT_DARK
        )
    _shadow(d, cx - 26, cy - 12, cx + 26, cy + 22)
    d.ellipse([cx - 26, cy - 14, cx + 26, cy + 18], fill=WOOD_DARK)
    d.ellipse([cx - 26, cy - 20, cx + 26, cy + 12], fill=WOOD)
    d.ellipse([cx - 17, cy - 14, cx + 17, cy + 5], fill=shade(WOOD, 13))


def prop_long_table(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    """대형 회의 테이블 — 좌우로 의자가 늘어섭니다"""
    cy = oy + h // 2
    for i in range(6):
        x = ox + 22 + i * 32
        d.rounded_rectangle([x, oy + 2, x + 22, oy + 18], radius=4, fill=MINT)
        d.rounded_rectangle([x, oy + h - 20, x + 22, oy + h - 4], radius=4, fill=MINT_DARK)
    _shadow(d, ox + 10, cy - 18, ox + w - 11, cy + 30)
    _table_top(d, [ox + 8, cy - 26, ox + w - 9, cy + 26], 10)
    for i in range(4):
        x = ox + 30 + i * 44
        d.rounded_rectangle([x, cy - 8, x + 22, cy + 6], radius=2, fill=(255, 255, 255))


def prop_cluster_desk(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    """oVice 식 각진 4인 데스크 클러스터"""
    cx, cy = ox + w // 2, oy + h // 2
    _shadow(d, ox + 12, cy - 14, ox + w - 13, cy + 34)
    # 마름모꼴 상판 4개
    for dx, dy in ((-30, -14), (30, -14), (-30, 16), (30, 16)):
        box = [cx + dx - 30, cy + dy - 14, cx + dx + 28, cy + dy + 12]
        d.rounded_rectangle([box[0], box[1] + 8, box[2], box[3] + 6], radius=4, fill=TOP_EDGE)
        d.rounded_rectangle(box, radius=4, fill=TOP_WHITE)
        d.rounded_rectangle(box, radius=4, outline=TOP_EDGE)
        _monitor(d, cx + dx - 2, cy + dy - 22)
    # 의자
    for dx, dy in ((-52, 22), (52, 22), (-52, -24), (52, -24)):
        d.rounded_rectangle(
            [cx + dx - 10, cy + dy - 9, cx + dx + 10, cy + dy + 9], radius=5, fill=MINT
        )


def prop_printer(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    _shadow(d, ox + 4, oy + h - 7, ox + w - 5, oy + h - 1)
    d.rounded_rectangle([ox + 3, oy + 12, ox + w - 4, oy + h - 4], radius=3, fill=hex_rgb("#e4eaf1"))
    d.rounded_rectangle([ox + 6, oy + 4, ox + w - 7, oy + 16], radius=2, fill=hex_rgb("#cfd8e3"))
    d.rectangle([ox + 8, oy + 22, ox + w - 9, oy + 26], fill=(255, 255, 255))
    d.rectangle([ox + w - 10, oy + 15, ox + w - 8, oy + 17], fill=hex_rgb("#5ce89b"))


def prop_partition(d: ImageDraw.ImageDraw, ox: int, oy: int, w: int, h: int) -> None:
    """낮은 파티션 — 구역을 부드럽게 나눕니다"""
    _shadow(d, ox + 2, oy + h - 6, ox + w - 3, oy + h - 1)
    d.rounded_rectangle([ox, oy + 4, ox + w - 1, oy + h - 6], radius=2, fill=hex_rgb("#dfe7f0"))
    d.rectangle([ox, oy + 4, ox + w - 1, oy + 7], fill=hex_rgb("#c3cfdc"))
    d.rectangle([ox, oy + h - 9, ox + w - 1, oy + h - 6], fill=hex_rgb("#aebdcd"))


PROP_DRAWERS = {
    "desk": prop_desk,
    "desk_v": prop_desk_v,
    "chair": lambda d, x, y, w, h: prop_chair(d, x, y, w, h, back_top=False),
    "chair_up": lambda d, x, y, w, h: prop_chair(d, x, y, w, h, back_top=True),
    "plant": prop_plant,
    "bookshelf": prop_bookshelf,
    "whiteboard": prop_whiteboard,
    "meeting_table": prop_meeting_table,
    "sofa": prop_sofa,
    "cooler": prop_cooler,
    "lamp": prop_lamp,
    "server_rack": prop_server_rack,
    "coffee_table": prop_coffee_table,
    "door_mat": prop_door_mat,
    "workstation": prop_workstation,
    "round_table": prop_round_table,
    "long_table": prop_long_table,
    "cluster_desk": prop_cluster_desk,
    "printer": prop_printer,
    "partition": prop_partition,
}


def build_props() -> tuple[Image.Image, dict]:
    """가로로 이어 붙인 아틀라스 하나로 내보냅니다."""
    total_w = sum(w for _, w, _ in PROPS) + len(PROPS) * 2
    max_h = max(h for _, _, h in PROPS)
    sheet = Image.new("RGBA", (total_w, max_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(sheet, "RGBA")

    index = {}
    x = 0
    for name, w, h in PROPS:
        PROP_DRAWERS[name](d, x, 0, w, h)
        index[name] = {"x": x, "y": 0, "w": w, "h": h}
        x += w + 2
    return sheet, {"props": index}


# ── 실행 ────────────────────────────────────────────────
def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    characters, char_meta = build_characters()
    tiles, tile_meta = build_tiles()
    props, prop_meta = build_props()

    characters.save(os.path.join(OUT_DIR, "characters.png"))
    tiles.save(os.path.join(OUT_DIR, "tiles.png"))
    props.save(os.path.join(OUT_DIR, "props.png"))

    manifest = {"characters": char_meta, **tile_meta, **prop_meta}
    with open(os.path.join(OUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"characters.png  {characters.size[0]}×{characters.size[1]}  ({len(CHARACTERS)}명)")
    print(f"tiles.png       {tiles.size[0]}×{tiles.size[1]}  ({len(TILE_NAMES)}종)")
    print(f"props.png       {props.size[0]}×{props.size[1]}  ({len(PROPS)}종)")
    print(f"→ {os.path.abspath(OUT_DIR)}")


if __name__ == "__main__":
    main()
