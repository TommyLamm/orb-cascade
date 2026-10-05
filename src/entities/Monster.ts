import { MonsterData } from '../types';
import { MONSTERS_CONFIG } from '../core/Constants';

export class Monster {
  public data: MonsterData;
  public hurtTimer = 0; // 受傷紅光動畫
  public attackTimer = 0; // 反擊前搖動畫

  constructor(floorLevel: number) {
    const configIndex = Math.min(floorLevel - 1, MONSTERS_CONFIG.length - 1);
    const cfg = MONSTERS_CONFIG[configIndex];

    this.data = {
      ...cfg,
      currentHp: cfg.maxHp,
      currentCountdown: cfg.attackInterval,
    };
  }

  public update(dt: number): void {
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      if (this.hurtTimer < 0) this.hurtTimer = 0;
    }
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      if (this.attackTimer < 0) this.attackTimer = 0;
    }
  }

  public takeDamage(dmg: number): number {
    const actualDmg = Math.max(1, Math.floor(dmg));
    this.data.currentHp = Math.max(0, this.data.currentHp - actualDmg);
    this.hurtTimer = 0.35;
    return actualDmg;
  }

  public advanceTurn(): { shouldAttack: boolean; damage: number } {
    this.data.currentCountdown -= 1;
    if (this.data.currentCountdown <= 0) {
      this.data.currentCountdown = this.data.attackInterval;
      this.attackTimer = 0.5;
      return { shouldAttack: true, damage: this.data.attackDamage };
    }
    return { shouldAttack: false, damage: 0 };
  }

  public isAlive(): boolean {
    return this.data.currentHp > 0;
  }
}
