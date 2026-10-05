import { ORB_PHYSICS } from '../core/Constants';

export type BucketRewardType = 'FREE_BALL' | 'MANA_3X' | 'SCORE_5X';

export interface BucketSlot {
  type: BucketRewardType;
  label: string;
  color: string;
  glowColor: string;
  relativeStart: number; // -0.5 to 0.5
  relativeEnd: number;
}

export class Bucket {
  public x = 360;
  public y = ORB_PHYSICS.BUCKET_Y;
  public width = ORB_PHYSICS.BUCKET_WIDTH;
  public height = ORB_PHYSICS.BUCKET_HEIGHT;
  public time = 0;
  public isFrozen = false; // 被寒冰元素怪物凍結

  // 輪動滾動計時
  public slotCycleTimer = 0;
  public currentCycleIndex = 0;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.x = 360;
    this.time = 0;
    this.isFrozen = false;
    this.slotCycleTimer = 0;
    this.currentCycleIndex = 0;
  }

  public setExtendedWidth(extended: boolean): void {
    this.width = extended ? 175 : ORB_PHYSICS.BUCKET_WIDTH;
  }

  public update(dt: number): void {
    if (this.isFrozen) return;
    this.time += dt;
    this.slotCycleTimer += dt;

    // 每 6 秒滾動一次槽位標籤配置，增添柏青哥滾動大獎趣味性
    if (this.slotCycleTimer >= 6.0) {
      this.slotCycleTimer = 0;
      this.currentCycleIndex = (this.currentCycleIndex + 1) % 3;
    }

    // 正弦往返: 中心 360，振幅 210
    this.x = 360 + 210 * Math.sin(1.25 * this.time);
  }

  // 獲取當前 3 個槽位動態倍率標籤
  public getSlots(): BucketSlot[] {
    // 3 種滾動輪換配置
    const patterns: BucketRewardType[][] = [
      ['MANA_3X', 'SCORE_5X', 'FREE_BALL'],
      ['FREE_BALL', 'SCORE_5X', 'MANA_3X'],
      ['SCORE_5X', 'FREE_BALL', 'SCORE_5X'],
    ];

    const currentPattern = patterns[this.currentCycleIndex];

    const getSlotInfo = (type: BucketRewardType, start: number, end: number): BucketSlot => {
      switch (type) {
        case 'SCORE_5X':
          return {
            type,
            label: '5X JACKPOT',
            color: '#facc15',
            glowColor: '#ffd700',
            relativeStart: start,
            relativeEnd: end,
          };
        case 'MANA_3X':
          return {
            type,
            label: '3X MANA',
            color: '#38bdf8',
            glowColor: '#00f3ff',
            relativeStart: start,
            relativeEnd: end,
          };
        case 'FREE_BALL':
        default:
          return {
            type,
            label: 'FREE BALL',
            color: '#34d399',
            glowColor: '#10b981',
            relativeStart: start,
            relativeEnd: end,
          };
      }
    };

    return [
      getSlotInfo(currentPattern[0], -0.5, -0.18),
      getSlotInfo(currentPattern[1], -0.18, 0.18),
      getSlotInfo(currentPattern[2], 0.18, 0.5),
    ];
  }

  public checkCatch(orbX: number, orbY: number, orbRadius: number): { caught: boolean; reward?: BucketSlot } {
    const halfW = this.width / 2;
    const inX = orbX >= this.x - halfW && orbX <= this.x + halfW;
    const inY = orbY + orbRadius >= this.y - this.height / 2 && orbY <= this.y + this.height;

    if (!inX || !inY) {
      return { caught: false };
    }

    const relPos = (orbX - this.x) / this.width; // -0.5 to 0.5
    const slots = this.getSlots();

    for (const slot of slots) {
      if (relPos >= slot.relativeStart && relPos <= slot.relativeEnd) {
        return { caught: true, reward: slot };
      }
    }

    return { caught: true, reward: slots[1] }; // 預設中央槽位
  }

  public containsOrb(orbX: number, orbY: number, orbRadius: number): boolean {
    return this.checkCatch(orbX, orbY, orbRadius).caught;
  }
}
