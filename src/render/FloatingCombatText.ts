export type DamageType = 'NORMAL' | 'CRIT' | 'MAGIC' | 'SPECIAL';

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  color: string;
  shadowColor: string;
  fontSize: number;
  isBold: boolean;
  scale: number;
  life: number;
  maxLife: number;
  type: DamageType;
}

export class FloatingCombatText {
  private texts: FloatingText[] = [];

  // 普通傷害（白色）
  public spawnNormalDamage(dmg: number, x: number, y: number): void {
    const vx = (Math.random() - 0.5) * 60;
    const vy = -120 - Math.random() * 40;
    this.texts.push({
      text: `+${dmg}`,
      x,
      y,
      vx,
      vy,
      gravity: 280,
      color: '#ffffff',
      shadowColor: 'rgba(255, 255, 255, 0.4)',
      fontSize: 18,
      isBold: false,
      scale: 1.3,
      life: 0.75,
      maxLife: 0.75,
      type: 'NORMAL',
    });
  }

  // 弱點爆擊（亮金）
  public spawnCritDamage(dmg: number, x: number, y: number): void {
    const vx = (Math.random() - 0.5) * 110;
    const vy = -210 - Math.random() * 60;
    this.texts.push({
      text: `CRIT! +${dmg}`,
      x,
      y,
      vx,
      vy,
      gravity: 340,
      color: '#ffd700',
      shadowColor: '#f59e0b',
      fontSize: 28,
      isBold: true,
      scale: 1.6,
      life: 0.95,
      maxLife: 0.95,
      type: 'CRIT',
    });
  }

  // 連鎖魔法（紫色）
  public spawnMagicDamage(dmg: number, x: number, y: number): void {
    const vx = (Math.random() - 0.5) * 90;
    const vy = -170 - Math.random() * 50;
    this.texts.push({
      text: `MAGIC +${dmg}`,
      x,
      y,
      vx,
      vy,
      gravity: 300,
      color: '#c084fc',
      shadowColor: '#9333ea',
      fontSize: 23,
      isBold: true,
      scale: 1.45,
      life: 0.85,
      maxLife: 0.85,
      type: 'MAGIC',
    });
  }

  // 特殊提示文字 (保留兼容)
  public spawn(
    text: string,
    x: number,
    y: number,
    color = '#00f3ff',
    fontSize = 20,
    isBold = false
  ): void {
    const vx = (Math.random() - 0.5) * 40;
    const vy = -110;
    this.texts.push({
      text,
      x,
      y,
      vx,
      vy,
      gravity: 160,
      color,
      shadowColor: color,
      fontSize,
      isBold,
      scale: 1.25,
      life: 0.9,
      maxLife: 0.9,
      type: 'SPECIAL',
    });
  }

  public update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const item = this.texts[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }

      // 重力拋物線
      item.vy += item.gravity * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;

      // 彈跳縮放迅速回彈至 1.0
      if (item.scale > 1.0) {
        item.scale = Math.max(1.0, item.scale - dt * 3.5);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.texts.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const item of this.texts) {
      const alpha = Math.min(1.0, item.life / (item.maxLife * 0.45));
      ctx.globalAlpha = Math.max(0, alpha);

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.scale(item.scale, item.scale);

      ctx.font = `${item.isBold ? '900 ' : 'bold '}${item.fontSize}px sans-serif`;

      // 爆擊與魔法光暈
      if (item.type === 'CRIT' || item.type === 'MAGIC') {
        ctx.shadowColor = item.shadowColor;
        ctx.shadowBlur = 12;
      } else {
        ctx.shadowBlur = 0;
      }

      // 粗黑色描邊確保任何背景下的極佳可讀性
      ctx.strokeStyle = '#05070f';
      ctx.lineWidth = item.isBold ? 4.5 : 3.5;
      ctx.lineJoin = 'round';
      ctx.strokeText(item.text, 0, 0);

      // 文字本體填色
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, 0, 0);

      ctx.restore();
    }

    ctx.restore();
  }
}
