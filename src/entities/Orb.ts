import { ORB_PHYSICS } from '../core/Constants';
import { Peg } from './Peg';

export interface CollisionEvent {
  type: 'PEG' | 'WALL' | 'PORTAL' | 'EXPLOSION' | 'MUSHROOM' | 'RESET' | 'SHIELD_CORE' | 'MINION';
  peg?: Peg;
  x: number;
  y: number;
  isWeakpoint?: boolean;
}

export class Orb {
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius = ORB_PHYSICS.ORB_RADIUS;
  public isSecondary = false; // 是否為分裂的次級子球
  public isMiniBullet = false; // 稜鏡碎屑分裂的微型爆破子彈
  public isDead = false;
  public isSalvaged = false; // 被硬超時救回

  // 穿透之矛遺物次數
  public piercingCharges = 0;

  // 過載電池加成狀態 (下次彈跳傷害翻倍)
  public isOvercharged = false;

  // 傳送門冷卻（避免兩門間無限微秒反覆折射）
  public portalCooldown = 0;

  // 防卡球檢測
  private lowSpeedTimer = 0;
  private lifeTime = 0;

  // 拖尾光軌歷史點
  public trail: { x: number; y: number }[] = [];

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    isSecondary = false,
    isMiniBullet = false
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.isSecondary = isSecondary;
    this.isMiniBullet = isMiniBullet;

    if (isMiniBullet) {
      this.radius = ORB_PHYSICS.ORB_RADIUS * 0.55;
    } else if (isSecondary) {
      this.radius = ORB_PHYSICS.ORB_RADIUS * 0.75;
    }
  }

  public update(
    dt: number,
    pegs: Peg[],
    restitutionMultiplier = 1.0,
    onCollision?: (event: CollisionEvent) => void
  ): void {
    if (this.isDead) return;

    this.lifeTime += dt;
    if (this.portalCooldown > 0) {
      this.portalCooldown -= dt;
    }

    // 1. 速度與空氣阻力更新
    this.vy += ORB_PHYSICS.GRAVITY_Y * dt;
    const drag = Math.pow(ORB_PHYSICS.AIR_DRAG, dt * 60);
    this.vx *= drag;
    this.vy *= drag;

    // 終端速度限制
    const speedSq = this.vx * this.vx + this.vy * this.vy;
    if (speedSq > ORB_PHYSICS.TERMINAL_VELOCITY * ORB_PHYSICS.TERMINAL_VELOCITY) {
      const speed = Math.sqrt(speedSq);
      this.vx = (this.vx / speed) * ORB_PHYSICS.TERMINAL_VELOCITY;
      this.vy = (this.vy / speed) * ORB_PHYSICS.TERMINAL_VELOCITY;
    }

    // 2. 連續碰撞檢測 (CCD) 亞步進 (Sub-stepping)
    // 限制每個子步進的最大位移不超過 3.5px，徹底杜絕極速穿牆與死角穿透
    const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const maxSubStepDist = 3.5;
    const subSteps = Math.max(1, Math.min(8, Math.ceil((currentSpeed * dt) / maxSubStepDist)));
    const subDt = dt / subSteps;

    for (let step = 0; step < subSteps; step++) {
      if (this.isDead) break;

      this.x += this.vx * subDt;
      this.y += this.vy * subDt;

      // 邊界檢測與夾持反彈 (左右側牆與天花板)
      if (this.x <= ORB_PHYSICS.WALL_LEFT + this.radius) {
        this.x = ORB_PHYSICS.WALL_LEFT + this.radius;
        this.vx = Math.abs(this.vx) * 0.86;
        onCollision?.({ type: 'WALL', x: this.x, y: this.y });
      } else if (this.x >= ORB_PHYSICS.WALL_RIGHT - this.radius) {
        this.x = ORB_PHYSICS.WALL_RIGHT - this.radius;
        this.vx = -Math.abs(this.vx) * 0.86;
        onCollision?.({ type: 'WALL', x: this.x, y: this.y });
      }

      if (this.y <= ORB_PHYSICS.CEILING_TOP + this.radius) {
        this.y = ORB_PHYSICS.CEILING_TOP + this.radius;
        this.vy = Math.abs(this.vy) * 0.86;
        onCollision?.({ type: 'WALL', x: this.x, y: this.y });
      }

      // 釘子碰撞檢測
      for (let i = 0; i < pegs.length; i++) {
        const peg = pegs[i];
        if (peg.isDestroyed) continue;

        const dx = this.x - peg.x;
        const dy = this.y - peg.y;
        const minDist = this.radius + peg.radius;
        const distSq = dx * dx + dy * dy;

        if (distSq <= minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          const nx = dx / dist;
          const ny = dy / dist;

          // 穿透之矛遺物機制
          if (this.piercingCharges > 0 && peg.type !== 'PORTAL' && peg.type !== 'SHIELD_CORE') {
            this.piercingCharges--;
            peg.triggerHitFlash();
            onCollision?.({
              type: 'PEG',
              peg,
              x: peg.x,
              y: peg.y,
              isWeakpoint: peg.type === 'WEAKPOINT',
            });
            continue;
          }

          // 傳送門專屬處理
          if (peg.type === 'PORTAL' && peg.pairedPortalId && this.portalCooldown <= 0) {
            const targetPortal = pegs.find((p) => p.id === peg.pairedPortalId);
            if (targetPortal) {
              this.x = targetPortal.x;
              this.y = targetPortal.y;
              this.vx *= ORB_PHYSICS.PORTAL_EXIT_BOOST;
              this.vy *= ORB_PHYSICS.PORTAL_EXIT_BOOST;
              this.portalCooldown = 0.6;
              onCollision?.({ type: 'PORTAL', peg: targetPortal, x: targetPortal.x, y: targetPortal.y });
              break;
            }
          }

          // 穿透位置校正 (CCD Position Correction)
          const penetration = minDist - dist;
          this.x += nx * (penetration + 0.3);
          this.y += ny * (penetration + 0.3);

          // 法向逼近速度
          const vn = this.vx * nx + this.vy * ny;
          if (vn < 0) {
            let restitution = ORB_PHYSICS.PEG_RESTITUTION * restitutionMultiplier;

            if (peg.type === 'MUSHROOM') {
              restitution = ORB_PHYSICS.MUSHROOM_RESTITUTION;
              // 向上彈力額外提升
              this.vy = -Math.abs(this.vy) * 1.28 - 220;
              this.isOvercharged = true; // 蓄積過載電池
              onCollision?.({ type: 'MUSHROOM', peg, x: peg.x, y: peg.y });
            } else {
              const J = -(1 + restitution) * vn;
              this.vx += J * nx;
              this.vy += J * ny;

              if (peg.type === 'TNT') {
                onCollision?.({ type: 'EXPLOSION', peg, x: peg.x, y: peg.y });
              } else if (peg.type === 'RESET') {
                onCollision?.({ type: 'RESET', peg, x: peg.x, y: peg.y });
              } else if (peg.type === 'SHIELD_CORE') {
                onCollision?.({ type: 'SHIELD_CORE', peg, x: peg.x, y: peg.y });
              } else if (peg.type === 'MINION') {
                onCollision?.({ type: 'MINION', peg, x: peg.x, y: peg.y });
              } else {
                onCollision?.({
                  type: 'PEG',
                  peg,
                  x: peg.x,
                  y: peg.y,
                  isWeakpoint: peg.type === 'WEAKPOINT',
                });
              }
            }
            peg.triggerHitFlash();
            break;
          }
        }
      }
    }

    // 3. 記錄拖尾光軌
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > (this.isOvercharged ? 16 : 12)) {
      this.trail.shift();
    }

    // 4. 防卡球多重防護
    if (this.y < ORB_PHYSICS.FLOOR_DEAD_ZONE - 100) {
      if (currentSpeed < ORB_PHYSICS.STUCK_VELOCITY_THRESHOLD) {
        this.lowSpeedTimer += dt;
        // 第一重：輕微脈衝推擠 (Soft Jiggle)
        if (this.lowSpeedTimer > 0.8) {
          const side = Math.random() > 0.5 ? 1 : -1;
          this.vx += side * 180;
          this.vy += 80;
        }
        // 第二重：縮小半徑穿透脫困 (Force Drop)
        if (this.lowSpeedTimer > ORB_PHYSICS.STUCK_TIMEOUT_SECONDS) {
          this.radius = 4;
          this.vy += 260;
        }
      } else {
        this.lowSpeedTimer = 0;
        this.radius = this.isMiniBullet
          ? ORB_PHYSICS.ORB_RADIUS * 0.55
          : (this.isSecondary ? ORB_PHYSICS.ORB_RADIUS * 0.75 : ORB_PHYSICS.ORB_RADIUS);
      }

      // 第三重：硬超時救死機制 (Hard Timeout)
      if (this.lifeTime > ORB_PHYSICS.HARD_TIMEOUT_SECONDS) {
        this.isSalvaged = true;
        this.y = ORB_PHYSICS.FLOOR_DEAD_ZONE + 10;
        this.isDead = true;
      }
    }

    // 5. 掉入落溝死區
    if (this.y > ORB_PHYSICS.FLOOR_DEAD_ZONE) {
      this.isDead = true;
    }
  }
}
