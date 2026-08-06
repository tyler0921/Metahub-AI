import type { DeskPosition, OfficeMap } from '@shared';

/** 2D 메타버스 오피스 맵 (타일 단위 좌표계) */
export class OfficeMapEntity implements OfficeMap {
  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly tile: number,
    readonly ceoDesk: DeskPosition,
  ) {}

  get pixelWidth(): number {
    return this.cols * this.tile;
  }

  get pixelHeight(): number {
    return this.rows * this.tile;
  }

  contains(desk: DeskPosition): boolean {
    return desk.x >= 0 && desk.x < this.cols && desk.y >= 0 && desk.y < this.rows;
  }

  toPublic(): OfficeMap {
    return {
      cols: this.cols,
      rows: this.rows,
      tile: this.tile,
      ceoDesk: this.ceoDesk,
    };
  }
}
