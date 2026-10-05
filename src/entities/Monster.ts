import { MonsterData } from '../types';
import { MONSTERS_CONFIG } from '../core/Constants';

export class Monster {
  public data: MonsterData;
  public hurtTimer = 0; // 受傷紅光動畫
  public attackTimer = 0; // 反擊前搖動畫
  public shieldFlashTimer = 0; // 護盾受創藍光動畫
  public isEnraged = false; // Boss 血量低於 30% 狂暴狀態
  public rageAuraPhase = 0;
  private minionTurnCounter = 0;

  constructor(floorLevel: number, isEndless = false, endlessHpMultiplier = 1.0) {
    const configIndex = Math.min(floorLevel - 1, MONSTERS_CONFIG.length - 1);
    const cfg = MONSTERS_CONFIG[configIndex];

    const maxHp = isEndless
      ? Math.floor(cfg.maxHp * endlessHpMultiplier)
      : cfg.maxHp;

    const attackDamage = isEndless
      ? Math.floor(cfg.attackDamage * (1 + (floorLevel - 1) * 0.12))
      : cfg.attackDamage;

    this.data = {
      ...cfg,
      floor: floorLevel,
      maxHp,
      currentHp: maxHp,
      attackDamage,
      currentCountdown: cfg.attackInterval,
      shieldCurrent: cfg.shieldMax,
      isEnraged: false,
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
    if (this.shieldFlashTimer > 0) {
      this.shieldFlashTimer -= dt;
      if (this.shieldFlashTimer < 0) this.shieldFlashTimer = 0;
    }
    if (this.isEnraged) {
      this.rageAuraPhase += dt * 8;
    }
  }

  public isShieldActive(): boolean {
    return this.data.hasShield && this.data.shieldCurrent > 0;
  }

  public damageShield(amount = 1): { isBroken: boolean; remaining: number } {
    if (!this.isShieldActive()) {
      return { isBroken: false, remaining: 0 };
    }
    this.data.shieldCurrent = Math.max(0, this.data.shieldCurrent - amount);
    this.shieldFlashTimer = 0.4;
    const isBroken = this.data.shieldCurrent === 0;
    if (isBroken) {
      this.data.hasShield = false;
    }
    return { isBroken, remaining: this.data.shieldCurrent };
  }

  public takeDamage(dmg: number): { actualDmg: number; isShieldDeflected: boolean; justEnraged: boolean } {
    let actualDmg = Math.max(1, Math.floor(dmg));
    const isShieldDeflected = this.isShieldActive();

    // 若護盾仍在，造成極大幅度減免 (85% 減免，僅保留 15% 穿透)
    if (isShieldDeflected) {
      actualDmg = Math.max(1, Math.floor(actualDmg * 0.15));
      this.shieldFlashTimer = 0.3;
    }

    this.data.currentHp = Math.max(0, this.data.currentHp - actualDmg);
    this.hurtTimer = 0.35;

    let justEnraged = false;
    // 首領血量低於 30% 觸發暴怒
    if (this.data.isBoss && !this.isEnraged && this.data.currentHp > 0 && this.data.currentHp / this.data.maxHp <= 0.30) {
      this.isEnraged = true;
      this.data.isEnraged = true;
      justEnraged = true;
      // 狂暴縮短攻擊間隔
      this.data.attackInterval = Math.max(1, this.data.attackInterval - 1);
      this.data.currentCountdown = Math.min(this.data.currentCountdown, this.data.attackInterval);
      this.data.attackDamage = Math.floor(this.data.attackDamage * 1.25);
    }

    return { actualDmg, isShieldDeflected, justEnraged };
  }

  public advanceTurn(): { shouldAttack: boolean; damage: number; shouldSpawnMinion: boolean } {
    this.data.currentCountdown -= 1;
    this.minionTurnCounter += 1;

    let shouldSpawnMinion = false;
    if (this.data.isBoss && this.data.minionCooldown > 0 && this.minionTurnCounter % this.data.minionCooldown === 0) {
      shouldSpawnMinion = true;
    }

    if (this.data.currentCountdown <= 0) {
      this.data.currentCountdown = this.data.attackInterval;
      this.attackTimer = 0.5;
      return { shouldAttack: true, damage: this.data.attackDamage, shouldSpawnMinion };
    }
    return { shouldAttack: false, damage: 0, shouldSpawnMinion };
  }

  public isAlive(): boolean {
    return this.data.currentHp > 0;
  }
}
