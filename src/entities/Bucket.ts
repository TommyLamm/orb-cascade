import { ORB_PHYSICS } from '../core/Constants';

export class Bucket {
  public x = 360;
  public y = ORB_PHYSICS.BUCKET_Y;
  public width = ORB_PHYSICS.BUCKET_WIDTH;
  public height = ORB_PHYSICS.BUCKET_HEIGHT;
  public time = 0;
  public isFrozen = false; // 被寒冰元素怪物凍結

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.x = 360;
    this.time = 0;
    this.isFrozen = false;
  }

  public setExtendedWidth(extended: boolean): void {
    this.width = extended ? 175 : ORB_PHYSICS.BUCKET_WIDTH;
  }

  public update(dt: number): void {
    if (this.isFrozen) return;
    this.time += dt;
    // 正弦往返: 中心 360，振幅 210
    this.x = 360 + 210 * Math.sin(1.25 * this.time);
  }

  public containsOrb(orbX: number, orbY: number, orbRadius: number): boolean {
    const halfW = this.width / 2;
    const inX = orbX >= this.x - halfW && orbX <= this.x + halfW;
    const inY = orbY + orbRadius >= this.y - this.height / 2 && orbY <= this.y + this.height;
    return inX && inY;
  }
}
