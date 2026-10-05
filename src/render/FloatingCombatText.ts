export interface FloatingText {
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  isBold: boolean;
  life: number;
  maxLife: number;
}

export class FloatingCombatText {
  private texts: FloatingText[] = [];

  public spawn(
    text: string,
    x: number,
    y: number,
    color = '#00f3ff',
    fontSize = 20,
    isBold = false
  ): void {
    this.texts.push({
      text,
      x,
      y,
      color,
      fontSize,
      isBold,
      life: 0.85,
      maxLife: 0.85,
    });
  }

  public update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const item = this.texts[i];
      item.life -= dt;
      item.y -= 45 * dt; // 向上漂浮
      if (item.life <= 0) {
        this.texts.splice(i, 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.texts.length === 0) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const item of this.texts) {
      const alpha = Math.min(1.0, item.life / (item.maxLife * 0.6));
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = item.color;
      ctx.font = `${item.isBold ? 'bold ' : ''}${item.fontSize}px sans-serif`;

      // 黑色描邊增加可讀性
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(item.text, item.x, item.y);
      ctx.fillText(item.text, item.x, item.y);
    }

    ctx.restore();
  }
}
