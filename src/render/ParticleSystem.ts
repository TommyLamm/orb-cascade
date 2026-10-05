export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
}

export class ParticleSystem {
  private pool: Particle[] = [];
  private readonly poolSize = 380;

  constructor() {
    for (let i = 0; i < this.poolSize; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        color: '#ffffff',
        alpha: 1,
        life: 0,
        maxLife: 1,
        gravity: 0,
        drag: 1,
      });
    }
  }

  private alloc(): Particle | null {
    for (let i = 0; i < this.poolSize; i++) {
      if (!this.pool[i].active) {
        return this.pool[i];
      }
    }
    return null;
  }

  public emitSparks(x: number, y: number, color: string, count = 10, speedMult = 1.0): void {
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = (80 + Math.random() * 220) * speedMult;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 2 + Math.random() * 3.5;
      p.color = color;
      p.alpha = 1.0;
      p.life = 0.3 + Math.random() * 0.35;
      p.maxLife = p.life;
      p.gravity = 400;
      p.drag = 0.96;
    }
  }

  public emitExplosion(x: number, y: number, count = 28): void {
    const colors = ['#ff3300', '#ff8800', '#ffcc00', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 350;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 3 + Math.random() * 6;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.alpha = 1.0;
      p.life = 0.4 + Math.random() * 0.4;
      p.maxLife = p.life;
      p.gravity = 250;
      p.drag = 0.94;
    }
  }

  public emitCritStars(x: number, y: number, count = 16): void {
    for (let i = 0; i < count; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = (i / count) * Math.PI * 2;
      const speed = 150 + Math.random() * 100;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 4 + Math.random() * 3;
      p.color = '#ffd700';
      p.alpha = 1.0;
      p.life = 0.45;
      p.maxLife = p.life;
      p.gravity = 150;
      p.drag = 0.92;
    }
  }

  public emitPortalVortex(x: number, y: number, color = '#a855f7'): void {
    for (let i = 0; i < 14; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 22;
      p.active = true;
      p.x = x + Math.cos(angle) * dist;
      p.y = y + Math.sin(angle) * dist;
      p.vx = -Math.cos(angle) * 70;
      p.vy = -Math.sin(angle) * 70;
      p.size = 2 + Math.random() * 3.5;
      p.color = color;
      p.alpha = 1.0;
      p.life = 0.38;
      p.maxLife = p.life;
      p.gravity = 0;
      p.drag = 0.95;
    }
  }

  // 隕石衝擊波粒子 (全向超高速擴散光環粒子)
  public emitMeteorShockwave(x: number, y: number): void {
    const colors = ['#f97316', '#fbbf24', '#ffedd5', '#ef4444'];
    for (let i = 0; i < 40; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = (i / 40) * Math.PI * 2;
      const speed = 200 + Math.random() * 280;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 3.5 + Math.random() * 5;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.alpha = 1.0;
      p.life = 0.5 + Math.random() * 0.2;
      p.maxLife = p.life;
      p.gravity = 80;
      p.drag = 0.93;
    }
  }

  // 能量護盾破碎結晶粒子
  public emitShieldBreak(x: number, y: number): void {
    const colors = ['#38bdf8', '#818cf8', '#c084fc', '#ffffff'];
    for (let i = 0; i < 32; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 140 + Math.random() * 320;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 3 + Math.random() * 4;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.alpha = 1.0;
      p.life = 0.6;
      p.maxLife = p.life;
      p.gravity = 200;
      p.drag = 0.94;
    }
  }

  // 小怪干擾釘召喚暗影法陣粒子
  public emitMinionSpawn(x: number, y: number): void {
    for (let i = 0; i < 20; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * 25;
      p.active = true;
      p.x = x + Math.cos(angle) * dist;
      p.y = y + Math.sin(angle) * dist;
      p.vx = (Math.random() - 0.5) * 50;
      p.vy = -60 - Math.random() * 80;
      p.size = 2.5 + Math.random() * 3;
      p.color = Math.random() > 0.5 ? '#9333ea' : '#dc2626';
      p.alpha = 1.0;
      p.life = 0.5;
      p.maxLife = p.life;
      p.gravity = -40; // 向上漂浮
      p.drag = 0.96;
    }
  }

  // 魔菇超導過載綠色電弧微粒
  public emitOverchargeElectrics(x: number, y: number): void {
    for (let i = 0; i < 15; i++) {
      const p = this.alloc();
      if (!p) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 160;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = 2.5 + Math.random() * 3;
      p.color = '#22c55e';
      p.alpha = 1.0;
      p.life = 0.35;
      p.maxLife = p.life;
      p.gravity = 100;
      p.drag = 0.92;
    }
  }

  public update(dt: number): void {
    for (let i = 0; i < this.poolSize; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.vy += p.gravity * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      p.alpha = p.life / p.maxLife;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.poolSize; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
