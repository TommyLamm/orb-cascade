import { ORB_PHYSICS, COMBO_LADDER, SPECIAL_ORBS_CONFIG } from '../core/Constants';
import { Peg } from '../entities/Peg';
import { Orb } from '../entities/Orb';
import { Bucket } from '../entities/Bucket';
import { Monster } from '../entities/Monster';
import { Relic, TrajectoryPoint, GameState, OrbCascadeSave, OrbType, GameMode, ChallengeModifier } from '../types';
import { ParticleSystem } from './ParticleSystem';
import { FloatingCombatText } from './FloatingCombatText';

interface StarDust {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  alpha: number;
  baseAlpha: number;
  pulsePhase: number;
}

export interface GlowDecal {
  x: number;
  y: number;
  color: string;
  alpha: number;
  maxAlpha: number;
  radius: number;
  life: number;
  maxLife: number;
  rotation: number;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;

  // 螢幕震動參數
  private shakeIntensity = 0;
  private shakeDecay = 8.5;
  private shakeTime = 0;

  // 動態視覺計時器
  private visualTime = 0;
  private aimStreamOffset = 0;

  // 背景飄動星塵微粒
  private starDustList: StarDust[] = [];

  // 釘子引爆後在盤面留下的短暫微光烙印 (Residual Glow Decals)
  private glowDecals: GlowDecal[] = [];

  // 當前鼠標/觸控懸停卡牌索引
  public hoveredCardIndex = -1;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context not supported');
    this.ctx = context;

    // 初始化 70 顆深邃背景飄浮星塵
    for (let i = 0; i < 70; i++) {
      this.starDustList.push({
        x: Math.random() * ORB_PHYSICS.VIRTUAL_WIDTH,
        y: Math.random() * ORB_PHYSICS.VIRTUAL_HEIGHT,
        size: 1.0 + Math.random() * 2.2,
        speedX: (Math.random() - 0.5) * 12,
        speedY: -8 - Math.random() * 20,
        alpha: 0.3 + Math.random() * 0.5,
        baseAlpha: 0.3 + Math.random() * 0.4,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  public triggerShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  // 添加盤面微光烙印
  public addGlowDecal(x: number, y: number, color = '#ffd700', radius = 16): void {
    this.glowDecals.push({
      x,
      y,
      color,
      alpha: 1.0,
      maxAlpha: 1.0,
      radius,
      life: 1.8,
      maxLife: 1.8,
      rotation: Math.random() * Math.PI * 2,
    });
    if (this.glowDecals.length > 40) {
      this.glowDecals.shift();
    }
  }

  public update(dt: number): void {
    this.visualTime += dt;
    this.aimStreamOffset = (this.aimStreamOffset + dt * 48) % 32;

    // 螢幕震動衰減
    if (this.shakeIntensity > 0) {
      this.shakeTime += dt;
      this.shakeIntensity -= this.shakeDecay * dt * this.shakeIntensity;
      if (this.shakeIntensity < 0.1) {
        this.shakeIntensity = 0;
        this.shakeTime = 0;
      }
    }

    // 更新背景星塵
    const w = ORB_PHYSICS.VIRTUAL_WIDTH;
    const h = ORB_PHYSICS.VIRTUAL_HEIGHT;
    for (const star of this.starDustList) {
      star.x += star.speedX * dt;
      star.y += star.speedY * dt;
      star.pulsePhase += dt * 2.2;
      star.alpha = star.baseAlpha + Math.sin(star.pulsePhase) * 0.25;

      if (star.y < 0) {
        star.y = h;
        star.x = Math.random() * w;
      } else if (star.x < 0) {
        star.x = w;
      } else if (star.x > w) {
        star.x = 0;
      }
    }

    // 更新微光烙印淡出
    for (let i = this.glowDecals.length - 1; i >= 0; i--) {
      const d = this.glowDecals[i];
      d.life -= dt;
      d.rotation += dt * 0.5;
      d.alpha = Math.max(0, d.life / d.maxLife);
      if (d.life <= 0) {
        this.glowDecals.splice(i, 1);
      }
    }
  }

  public render(
    state: GameState,
    pegs: Peg[],
    orbs: Orb[],
    bucket: Bucket,
    monster: Monster,
    comboHits: number,
    turnScore: number,
    totalScore: number,
    floorLevel: number,
    playerHp: number,
    manaOrbs: number,
    relics: readonly Relic[],
    trajectory: TrajectoryPoint[],
    isAiming: boolean,
    aimAngleRad: number,
    particles: ParticleSystem,
    combatText: FloatingCombatText,
    saveData: OrbCascadeSave,
    draftRelics: Relic[] = [],
    equippedOrb: OrbType = 'STANDARD',
    unlockedOrbs: OrbType[] = ['STANDARD'],
    gameMode: GameMode = 'STANDARD',
    activeModifiers: readonly ChallengeModifier[] = []
  ): void {
    const ctx = this.ctx;
    const w = ORB_PHYSICS.VIRTUAL_WIDTH;
    const h = ORB_PHYSICS.VIRTUAL_HEIGHT;

    ctx.save();

    // 1. 螢幕震動位移
    if (this.shakeIntensity > 0) {
      const offsetX = Math.cos(this.shakeTime * 45) * this.shakeIntensity;
      const offsetY = Math.sin(this.shakeTime * 45) * this.shakeIntensity;
      ctx.translate(offsetX, offsetY);
    }

    // 2. 清除畫布並繪製動態星雲與深邃秘境背景 (Boss暴怒時全場赤紅暗流)
    this.renderBackground(ctx, w, h, monster);

    // 3. 釘盤與邊界引導槽、殘留微光烙印
    this.renderBorders(ctx);
    this.renderDecals(ctx);
    this.renderPegs(ctx, pegs, monster);

    // 4. 底部移動集球桶 (Dynamic Bucket Jackpot)
    this.renderBucket(ctx, bucket);

    // 5. 瞄準砲台、動態流光預測線與阻尼握柄 (僅在瞄準狀態且有彈珠時)
    if (state === 'BATTLE_AIM') {
      this.renderAimCannon(ctx, aimAngleRad, trajectory, isAiming, equippedOrb);
      this.renderOrbSelector(ctx, equippedOrb, unlockedOrbs);
    }

    // 6. 魔法彈珠繪製 (4 大特殊彈珠專屬渲染)
    this.renderOrbs(ctx, orbs);

    // 7. 粒子系統與浮動傷害數字
    particles.render(ctx);
    combatText.render(ctx);

    // 8. 頂部 HUD (包含 Boss 狂暴演出、血條、護盾、突變因子、暫停、靜音)
    this.renderHUD(
      ctx,
      monster,
      floorLevel,
      playerHp,
      manaOrbs,
      totalScore,
      turnScore,
      comboHits,
      relics,
      saveData.isMuted,
      gameMode,
      activeModifiers
    );

    // 9. 依據遊戲不同模態繪製彈窗 / 卡牌 Draft / 結算介面
    if (state === 'RELIC_DRAFT') {
      this.renderRelicDraft(ctx, w, h, draftRelics);
    } else if (state === 'PAUSED') {
      this.renderPauseMenu(ctx, w, h);
    } else if (state === 'TITLE') {
      this.renderTitleScreen(ctx, w, h, saveData, gameMode);
    } else if (state === 'GAME_OVER') {
      this.renderGameOver(ctx, w, h, totalScore, floorLevel, saveData, gameMode);
    } else if (state === 'VICTORY') {
      this.renderVictory(ctx, w, h, totalScore, saveData);
    }

    ctx.restore();
  }

  // 1. 動態背景與 Boss 狂暴暗紅星雲
  private renderBackground(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    monster: Monster
  ): void {
    const isEnraged = monster.isEnraged;

    // 深邃背景漸層
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    if (isEnraged) {
      // 狂暴怒焰色調
      const pulse = 0.5 + 0.5 * Math.sin(this.visualTime * 6);
      bgGrad.addColorStop(0, pulse > 0.5 ? '#24060e' : '#1a050b');
      bgGrad.addColorStop(0.35, '#2b0c15');
      bgGrad.addColorStop(0.7, '#15060d');
      bgGrad.addColorStop(1, '#0c0206');
    } else {
      bgGrad.addColorStop(0, '#070b14');
      bgGrad.addColorStop(0.35, '#0b1326');
      bgGrad.addColorStop(0.7, '#080d1a');
      bgGrad.addColorStop(1, '#04070d');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 飄動星塵
    ctx.save();
    for (const star of this.starDustList) {
      ctx.globalAlpha = Math.max(0, Math.min(1, star.alpha));
      ctx.fillStyle = isEnraged ? '#fca5a5' : '#e2e8f0';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 秘境古老同心魔導陣
    ctx.save();
    const ringColor = isEnraged ? 'rgba(239, 68, 68, 0.12)' : 'rgba(56, 189, 248, 0.06)';
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(360, 620, 270, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = isEnraged ? 'rgba(220, 38, 38, 0.10)' : 'rgba(168, 85, 247, 0.05)';
    ctx.beginPath();
    ctx.arc(360, 620, 170, 0, Math.PI * 2);
    ctx.stroke();

    // 旋轉符文微刻線
    const ringAngle = this.visualTime * (isEnraged ? 0.25 : 0.08);
    ctx.save();
    ctx.translate(360, 620);
    ctx.rotate(ringAngle);
    ctx.setLineDash([8, 14]);
    ctx.strokeStyle = isEnraged ? 'rgba(254, 202, 202, 0.08)' : 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.arc(0, 0, 220, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  // 2. 邊界與漏斗導軌
  private renderBorders(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = '#22324f';
    ctx.lineWidth = 4;

    ctx.beginPath();
    // 左側導軌
    ctx.moveTo(ORB_PHYSICS.WALL_LEFT, ORB_PHYSICS.CEILING_TOP);
    ctx.lineTo(ORB_PHYSICS.WALL_LEFT, 1080);
    ctx.lineTo(ORB_PHYSICS.WALL_LEFT + 60, 1220);
    ctx.lineTo(ORB_PHYSICS.WALL_LEFT + 120, 1240);

    // 右側導軌
    ctx.moveTo(ORB_PHYSICS.WALL_RIGHT, ORB_PHYSICS.CEILING_TOP);
    ctx.lineTo(ORB_PHYSICS.WALL_RIGHT, 1080);
    ctx.lineTo(ORB_PHYSICS.WALL_RIGHT - 60, 1220);
    ctx.lineTo(ORB_PHYSICS.WALL_RIGHT - 120, 1240);
    ctx.stroke();

    // 兩側落溝死亡危險警示區
    const dangerAlpha = 0.12 + Math.sin(this.visualTime * 3) * 0.04;
    ctx.fillStyle = `rgba(239, 68, 68, ${dangerAlpha})`;
    ctx.fillRect(0, 1230, 240, 50);
    ctx.fillRect(480, 1230, 240, 50);

    ctx.restore();
  }

  // 盤面微光烙印 (Residual Glow Imprints)
  private renderDecals(ctx: CanvasRenderingContext2D): void {
    if (this.glowDecals.length === 0) return;
    ctx.save();
    for (const d of this.glowDecals) {
      ctx.globalAlpha = d.alpha * 0.65;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rotation);

      // 外光環
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, d.radius * (1.2 + (1 - d.alpha) * 0.4), 0, Math.PI * 2);
      ctx.stroke();

      // 星芒核心
      ctx.fillStyle = d.color;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        ctx.lineTo(Math.cos(ang) * (d.radius * 0.9), Math.sin(ang) * (d.radius * 0.9));
        ctx.lineTo(Math.cos(ang + Math.PI / 4) * (d.radius * 0.3), Math.sin(ang + Math.PI / 4) * (d.radius * 0.3));
      }
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }

  // 3. 釘盤與機關釘繪製 (含寒霜冰凍易傷霜花特效)
  private renderPegs(ctx: CanvasRenderingContext2D, pegs: Peg[], monster: Monster): void {
    const isBossShieldUp = monster.isShieldActive();

    for (const peg of pegs) {
      if (peg.isDestroyed) continue;

      let baseColor = '#00f3ff';
      let shadowColor = '#00f3ff';
      let glowSize = 10;

      // 特殊釘繪製分支
      if (peg.type === 'WEAKPOINT') {
        baseColor = '#ffd700';
        shadowColor = '#ffbb00';
        glowSize = 16 + Math.sin(peg.glowPhase) * 5;

        // 弱點爆擊釘專屬：呼吸脈衝金色光圈
        ctx.save();
        const pulseRatio = 0.5 + 0.5 * Math.sin(this.visualTime * 5 + peg.id);
        const pulseR = peg.radius * (1.6 + pulseRatio * 0.5);
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.35 + pulseRatio * 0.45})`;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

      } else if (peg.type === 'SHIELD_CORE') {
        baseColor = '#38bdf8';
        shadowColor = '#818cf8';
        glowSize = 22 + Math.sin(peg.glowPhase * 2) * 6;

        // 若 Boss 護盾仍存在，繪製連向頂部 Boss 的能量連線
        if (isBossShieldUp) {
          ctx.save();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -this.aimStreamOffset;
          ctx.beginPath();
          ctx.moveTo(peg.x, peg.y);
          ctx.lineTo(600, 40);
          ctx.stroke();
          ctx.restore();
        }

        // 核心旋轉力場護盾雙環
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, peg.radius * 1.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

      } else if (peg.type === 'MINION') {
        baseColor = '#e11d48';
        shadowColor = '#be123c';
        glowSize = 14 + Math.sin(peg.glowPhase * 3) * 4;

        ctx.save();
        ctx.strokeStyle = 'rgba(225, 29, 72, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, peg.radius + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

      } else if (peg.type === 'TNT') {
        baseColor = '#ff3311';
        shadowColor = '#ff5522';
        glowSize = 16 + Math.sin(peg.glowPhase) * 3;
      } else if (peg.type === 'MUSHROOM') {
        baseColor = '#e040fb';
        shadowColor = '#aa00ff';
        glowSize = 18;
      } else if (peg.type === 'PORTAL') {
        baseColor = '#3b82f6';
        shadowColor = '#8b5cf6';
        glowSize = 20;
      } else if (peg.type === 'RESET') {
        baseColor = '#facc15';
        shadowColor = '#fbbf24';
        glowSize = 18 + Math.sin(peg.glowPhase * 2) * 5;
      } else {
        baseColor = peg.isHitThisTurn ? '#334155' : '#00e5ff';
        shadowColor = peg.isHitThisTurn ? '#1e293b' : '#00b4d8';
        glowSize = peg.isHitThisTurn ? 2 : 8;
      }

      ctx.save();
      // 外發光
      if (glowSize > 4) {
        ctx.shadowColor = shadowColor;
        ctx.shadowBlur = glowSize;
      }

      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
      ctx.fill();

      // 寒霜晶球冰凍易傷霜花幾何 (Frostbitten effect)
      if (peg.isFrostbitten) {
        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = '#bae6fd';
        ctx.lineWidth = 2;
        // 旋轉冰晶六角形
        const rot = peg.frostTimer * 1.5;
        ctx.translate(peg.x, peg.y);
        ctx.rotate(rot);
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
          const angle = (a * Math.PI) / 3;
          const r = peg.radius + 4;
          const px = Math.cos(angle) * r;
          const py = Math.sin(angle) * r;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❄️', 0, 0);
        ctx.restore();
      }

      // 內核高光
      ctx.shadowBlur = 0;
      ctx.fillStyle = peg.hitFlashTimer > 0 ? '#ffffff' : (peg.isHitThisTurn ? '#64748b' : '#ffffff');
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // 特殊圖示文字標籤
      if (peg.type === 'TNT') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TNT', peg.x, peg.y);
      } else if (peg.type === 'RESET') {
        ctx.fillStyle = '#1e1b4b';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', peg.x, peg.y);
      } else if (peg.type === 'SHIELD_CORE') {
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛡️', peg.x, peg.y);
      } else if (peg.type === 'MINION') {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(peg.minionHp > 1 ? '💀' : 'x', peg.x, peg.y);
      }

      ctx.restore();
    }
  }

  // 4. 底部移動集球桶 (Dynamic Bucket Jackpot 3 槽位動態分區)
  private renderBucket(ctx: CanvasRenderingContext2D, bucket: Bucket): void {
    ctx.save();
    const bx = bucket.x;
    const by = bucket.y;
    const bw = bucket.width;
    const bh = bucket.height;
    const halfW = bw / 2;

    const slots = bucket.getSlots();

    // 集球桶底部發光與本體底座
    ctx.shadowColor = bucket.isFrozen ? '#38bdf8' : '#ffd700';
    ctx.shadowBlur = 18;
    ctx.fillStyle = bucket.isFrozen ? '#0f172a' : '#0a101d';
    ctx.strokeStyle = bucket.isFrozen ? '#7dd3fc' : '#f59e0b';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.roundRect(bx - halfW, by - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 繪製 3 個動態槽位分區
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const slotX = bx + slot.relativeStart * bw;
      const slotW = (slot.relativeEnd - slot.relativeStart) * bw;
      const slotCenter = slotX + slotW / 2;

      // 槽位背景微弱高光
      ctx.fillStyle = slot.color === '#facc15' ? 'rgba(250, 204, 21, 0.16)' : 'rgba(56, 189, 248, 0.12)';
      ctx.fillRect(slotX + 1, by - bh / 2 + 2, slotW - 2, bh - 4);

      // 分隔線
      if (i > 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(slotX, by - bh / 2 + 2);
        ctx.lineTo(slotX, by + bh / 2 - 2);
        ctx.stroke();
      }

      // 標籤文字
      ctx.shadowColor = slot.glowColor;
      ctx.shadowBlur = slot.color === '#facc15' ? 10 : 6;
      ctx.fillStyle = slot.color;
      ctx.font = slot.color === '#facc15' ? 'bold 11px sans-serif' : 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.label, slotCenter, by);
      ctx.shadowBlur = 0;
    }

    // 集球桶上方金色指針與霓虹光效
    const needlePhase = (this.visualTime * 5) % 1;
    ctx.fillStyle = needlePhase > 0.5 ? '#ffd700' : '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(bx - 8, by - bh / 2 - 3);
    ctx.lineTo(bx + 8, by - bh / 2 - 3);
    ctx.lineTo(bx, by - bh / 2 + 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // 5. 瞄準砲台、動態流光預測線、阻尼拉桿微調握柄
  private renderAimCannon(
    ctx: CanvasRenderingContext2D,
    aimAngleRad: number,
    trajectory: TrajectoryPoint[],
    isAiming: boolean,
    equippedOrb: OrbType
  ): void {
    const cx = ORB_PHYSICS.CANNON_X;
    const cy = ORB_PHYSICS.CANNON_Y;

    ctx.save();

    // 1. 動態流光 3 次折射預測線
    if (trajectory.length > 1) {
      let lineColor = 'rgba(0, 243, 255, 0.95)';
      let shadowCol = '#00f3ff';
      if (equippedOrb === 'FROST') {
        lineColor = 'rgba(125, 211, 252, 0.95)';
        shadowCol = '#38bdf8';
      } else if (equippedOrb === 'LIGHTNING') {
        lineColor = 'rgba(250, 204, 21, 0.95)';
        shadowCol = '#facc15';
      } else if (equippedOrb === 'VOID') {
        lineColor = 'rgba(192, 132, 252, 0.95)';
        shadowCol = '#c084fc';
      }

      ctx.lineWidth = isAiming ? 3.0 : 2.2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -this.aimStreamOffset;
      ctx.strokeStyle = lineColor;
      ctx.shadowColor = shadowCol;
      ctx.shadowBlur = isAiming ? 14 : 6;

      ctx.beginPath();
      ctx.moveTo(trajectory[0].x, trajectory[0].y);
      for (let i = 1; i < trajectory.length; i++) {
        const pt = trajectory[i];
        ctx.lineTo(pt.x, pt.y);

        if (pt.isBounce) {
          ctx.stroke();
          ctx.save();
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#ffd700';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffd700';
          ctx.fill();
          ctx.restore();

          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // 落點處能量共振漣漪光環
      const lastPt = trajectory[trajectory.length - 1];
      if (lastPt) {
        ctx.save();
        for (let r = 0; r < 2; r++) {
          const ripplePhase = (this.visualTime * 3 + r * 0.5) % 1;
          const rippleRadius = 8 + ripplePhase * 24;
          const rippleAlpha = (1 - ripplePhase) * 0.7;
          ctx.strokeStyle = `rgba(0, 243, 255, ${rippleAlpha})`;
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(lastPt.x, lastPt.y, rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 2. 兩側精細微調按鈕：[ ◀ 1° ] 與 [ 1° ▶ ]
    // 左微調按鈕: [240, 150, 54, 34]
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(240, 150, 54, 34, 6);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀ 1°', 267, 167);

    // 右微調按鈕: [426, 150, 54, 34]
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.roundRect(426, 150, 54, 34, 6);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('1° ▶', 453, 167);

    // 3. 旋轉發射砲台
    ctx.save();
    ctx.translate(cx, cy);

    // 瞄準角度範圍導引弧線
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 56, (15 * Math.PI) / 180, (165 * Math.PI) / 180);
    ctx.stroke();

    ctx.rotate(aimAngleRad);

    // 砲管
    ctx.fillStyle = isAiming ? '#0f172a' : '#1e293b';
    ctx.strokeStyle = isAiming ? '#38bdf8' : '#00f3ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(0, -12, 44, 24, 6);
    ctx.fill();
    ctx.stroke();

    // 砲台基座圓球
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 裝填的魔法球微光
    let orbFill = '#00f3ff';
    if (equippedOrb === 'FROST') orbFill = '#7dd3fc';
    if (equippedOrb === 'LIGHTNING') orbFill = '#facc15';
    if (equippedOrb === 'VOID') orbFill = '#c084fc';

    ctx.fillStyle = orbFill;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // 瞄準時發射箭頭指引光芒
    if (isAiming) {
      ctx.fillStyle = orbFill;
      ctx.shadowColor = orbFill;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(52, 0);
      ctx.lineTo(46, -6);
      ctx.lineTo(46, 6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }

  // 特殊彈珠切換膠囊面板 (Orb Selector)
  private renderOrbSelector(ctx: CanvasRenderingContext2D, equippedOrb: OrbType, _unlockedOrbs: OrbType[]): void {
    ctx.save();
    // 位於 y: 195，中央排列 4 款彈珠按鈕
    const startX = 170;
    const btnW = 90;
    const btnH = 34;
    const gap = 6;

    for (let i = 0; i < SPECIAL_ORBS_CONFIG.length; i++) {
      const orbInfo = SPECIAL_ORBS_CONFIG[i];
      const bx = startX + i * (btnW + gap);
      const by = 195;
      const isSelected = equippedOrb === orbInfo.type;

      ctx.fillStyle = isSelected ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.7)';
      ctx.roundRect(bx, by, btnW, btnH, 6);
      ctx.fill();

      ctx.strokeStyle = isSelected ? orbInfo.color : '#334155';
      ctx.lineWidth = isSelected ? 2.5 : 1.2;
      ctx.stroke();

      if (isSelected) {
        ctx.shadowColor = orbInfo.glowColor;
        ctx.shadowBlur = 8;
      }

      ctx.fillStyle = isSelected ? '#ffffff' : '#94a3b8';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${orbInfo.icon} ${orbInfo.name.substring(0, 2)}`, bx + btnW / 2, by + btnH / 2);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // 6. 魔法彈珠繪製 (支援 4 款特殊彈珠外觀)
  private renderOrbs(ctx: CanvasRenderingContext2D, orbs: Orb[]): void {
    for (const orb of orbs) {
      if (orb.isDead) continue;

      ctx.save();

      // 拖尾光線
      if (orb.trail.length > 1) {
        ctx.lineWidth = orb.radius * 0.85;
        ctx.lineCap = 'round';
        for (let i = 0; i < orb.trail.length - 1; i++) {
          const p1 = orb.trail[i];
          const p2 = orb.trail[i + 1];
          const alpha = (i / orb.trail.length) * 0.55;

          if (orb.isOvercharged) {
            ctx.strokeStyle = `rgba(34, 197, 94, ${alpha})`;
          } else if (orb.isMiniBullet) {
            ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
          } else if (orb.orbType === 'FROST') {
            ctx.strokeStyle = `rgba(125, 211, 252, ${alpha})`;
          } else if (orb.orbType === 'LIGHTNING') {
            ctx.strokeStyle = `rgba(250, 204, 21, ${alpha})`;
          } else if (orb.orbType === 'VOID') {
            ctx.strokeStyle = `rgba(192, 132, 252, ${alpha})`;
          } else if (orb.isSecondary) {
            ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
          } else {
            ctx.strokeStyle = `rgba(0, 243, 255, ${alpha})`;
          }
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // 彈珠外光暈與顏色
      let glow = '#00f3ff';
      let ballFill = '#38bdf8';

      if (orb.isOvercharged) {
        glow = '#22c55e';
        ballFill = '#4ade80';
      } else if (orb.isMiniBullet) {
        glow = '#06b6d4';
        ballFill = '#67e8f9';
      } else if (orb.orbType === 'FROST') {
        glow = '#38bdf8';
        ballFill = '#7dd3fc';
      } else if (orb.orbType === 'LIGHTNING') {
        glow = '#facc15';
        ballFill = '#fef08a';
      } else if (orb.orbType === 'VOID') {
        glow = '#c084fc';
        ballFill = '#3b0764';
      } else if (orb.isSecondary) {
        glow = '#f59e0b';
        ballFill = '#fbbf24';
      }

      ctx.shadowColor = glow;
      ctx.shadowBlur = orb.isOvercharged ? 26 : 18;
      ctx.fillStyle = ballFill;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
      ctx.fill();

      // 虛空黑球特殊繪製：旋轉重力吸積盤雙環 (Accretion disk)
      if (orb.orbType === 'VOID') {
        ctx.save();
        ctx.strokeStyle = 'rgba(216, 180, 254, 0.7)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 彈珠核心白光
      ctx.shadowBlur = 0;
      ctx.fillStyle = orb.orbType === 'VOID' ? '#c084fc' : '#ffffff';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // 8. 頂部 HUD (包含 Boss 暴怒演出、能量護盾條、暫停按鈕、音效按鈕)
  private renderHUD(
    ctx: CanvasRenderingContext2D,
    monster: Monster,
    floorLevel: number,
    playerHp: number,
    manaOrbs: number,
    totalScore: number,
    turnScore: number,
    comboHits: number,
    relics: readonly Relic[],
    isMuted: boolean,
    gameMode: GameMode,
    activeModifiers: readonly ChallengeModifier[]
  ): void {
    ctx.save();

    // 頂部儀表板背景黑框
    ctx.fillStyle = monster.isEnraged ? 'rgba(24, 6, 12, 0.95)' : 'rgba(8, 12, 22, 0.94)';
    ctx.fillRect(0, 0, ORB_PHYSICS.VIRTUAL_WIDTH, 140);
    ctx.strokeStyle = monster.isEnraged ? '#ef4444' : '#1e293b';
    ctx.lineWidth = monster.isEnraged ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(0, 140);
    ctx.lineTo(ORB_PHYSICS.VIRTUAL_WIDTH, 140);
    ctx.stroke();

    // 1. 玩家生命值 (Player HP)
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('PLAYER HP', 24, 28);

    const hpWidth = 140;
    const hpHeight = 14;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(24, 34, hpWidth, hpHeight);
    const hpRatio = Math.max(0, playerHp / 100);
    ctx.fillStyle = hpRatio > 0.35 ? '#10b981' : '#ef4444';
    ctx.fillRect(24, 34, hpWidth * hpRatio, hpHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${playerHp}/100`, 30, 45);

    // 2. 樓層資訊 (FLOOR)
    ctx.textAlign = 'center';
    ctx.fillStyle = gameMode === 'ENDLESS' ? '#f59e0b' : '#38bdf8';
    ctx.font = 'bold 16px sans-serif';
    const floorLabel = gameMode === 'ENDLESS'
      ? `SPIRAL FLOOR ${floorLevel}`
      : `FLOOR ${floorLevel < 10 ? '0' + floorLevel : floorLevel} / 10`;
    ctx.fillText(floorLabel, 360, 26);

    // 突變因子徽章
    if (activeModifiers.length > 0) {
      let modStr = '';
      for (const m of activeModifiers) modStr += `${m.icon} `;
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(modStr.trim(), 360, 42);
    }

    // 3. 怪物名稱與血量條 (Boss 暴怒特效)
    ctx.textAlign = 'right';
    ctx.fillStyle = monster.isEnraged ? '#ff0033' : (monster.data.isBoss ? '#f43f5e' : '#cbd5e1');
    ctx.font = 'bold 13px sans-serif';
    const bossTitle = monster.isEnraged ? `🔥 [ENRAGED] ${monster.data.name}` : monster.data.name;
    ctx.fillText(bossTitle, 696, 26);

    const mHpW = 160;
    const mHpH = 14;
    const mHpX = 696 - mHpW;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(mHpX, 34, mHpW, mHpH);

    const mRatio = Math.max(0, monster.data.currentHp / monster.data.maxHp);
    ctx.fillStyle = monster.hurtTimer > 0
      ? '#ffffff'
      : (monster.isEnraged ? '#ff0044' : (monster.data.isBoss ? '#e11d48' : '#8b5cf6'));
    ctx.fillRect(mHpX, 34, mHpW * mRatio, mHpH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${monster.data.currentHp} / ${monster.data.maxHp}`, 690, 45);

    // Boss 能量護盾條
    if (monster.data.isBoss && monster.data.hasShield) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      let shieldIcons = '';
      for (let s = 0; s < monster.data.shieldCurrent; s++) shieldIcons += '🛡️';
      ctx.fillText(`SHIELD (${monster.data.shieldCurrent}/${monster.data.shieldMax}) ${shieldIcons}`, 696, 62);
    } else {
      ctx.fillStyle = monster.isEnraged ? '#ef4444' : '#f59e0b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`⚔️ 倒數 ${monster.data.currentCountdown} 回合`, 696, 64);
    }

    // 4. 剩餘魔法彈珠
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('MANA ORBS:', 24, 76);
    let orbIcons = '';
    for (let i = 0; i < manaOrbs; i++) orbIcons += '🔮 ';
    ctx.font = '16px sans-serif';
    ctx.fillText(orbIcons || '— 無剩餘 —', 115, 78);

    // 5. 分數與 Combo 倍率
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`SCORE: ${totalScore.toLocaleString()}`, 360, 58);

    let comboMultiplier = 1.0;
    let comboLabel = 'CASCADE';
    let comboColor = '#00f3ff';
    for (const step of COMBO_LADDER) {
      if (comboHits >= step.minHits && comboHits <= step.maxHits) {
        comboMultiplier = step.multiplier;
        comboLabel = step.label;
        comboColor = step.color;
        break;
      }
    }
    if (comboHits > 0) {
      ctx.fillStyle = comboColor;
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`${comboHits}x [${comboMultiplier.toFixed(2)}x] ${comboLabel}`, 360, 84);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText(`本輪累積傷害: +${turnScore}`, 360, 102);
    }

    // 6. 已裝備遺物圖示列
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText(`RELICS (${relics.length}/6):`, 24, 114);

    let relicX = 110;
    for (const r of relics) {
      ctx.fillStyle = r.iconColor;
      ctx.font = '16px sans-serif';
      ctx.fillText(r.icon, relicX, 116);
      relicX += 26;
    }

    // 7. 右上角按鈕組：暫停按鈕 [598, 92, 44, 30] 與 靜音開關 [652, 92, 44, 30]
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.fillRect(598, 92, 44, 30);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(598, 92, 44, 30);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px sans-serif';
    ctx.fillText('⏸️', 620, 112);

    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.fillRect(652, 92, 44, 30);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(652, 92, 44, 30);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '15px sans-serif';
    ctx.fillText(isMuted ? '🔇' : '🔊', 674, 112);

    ctx.restore();
  }

  // 9. 3 選 1 遺物抽卡介面
  private renderRelicDraft(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    draftRelics: Relic[]
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 14, 0.94)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('秘境寶藏：挑選一項神祕遺物', w / 2, 270);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px sans-serif';
    ctx.fillText('獲得強大的協同魔力，構築你的專屬連鎖流派！', w / 2, 310);

    const cardY = 360;
    const cardW = 550;
    const cardH = 138;
    const cardSpacing = 165;

    for (let i = 0; i < draftRelics.length; i++) {
      const relic = draftRelics[i];
      const y = cardY + i * cardSpacing;
      const isHovered = this.hoveredCardIndex === i;

      let rarityColor = '#10b981';
      let rarityLabel = 'COMMON';
      if (relic.rarity === 'RARE') {
        rarityColor = '#38bdf8';
        rarityLabel = 'RARE';
      } else if (relic.rarity === 'EPIC') {
        rarityColor = '#d946ef';
        rarityLabel = 'EPIC';
      } else if (relic.rarity === 'LEGENDARY') {
        rarityColor = '#f59e0b';
        rarityLabel = 'LEGENDARY';
      }

      ctx.save();
      ctx.shadowColor = rarityColor;
      ctx.shadowBlur = isHovered ? 28 : 14;

      const cx = 85;
      const cy = y;
      const cw = cardW;
      const ch = cardH;
      const cut = 16;

      ctx.beginPath();
      ctx.moveTo(cx + cut, cy);
      ctx.lineTo(cx + cw - cut, cy);
      ctx.lineTo(cx + cw, cy + cut);
      ctx.lineTo(cx + cw, cy + ch - cut);
      ctx.lineTo(cx + cw - cut, cy + ch);
      ctx.lineTo(cx + cut, cy + ch);
      ctx.lineTo(cx, cy + ch - cut);
      ctx.lineTo(cx, cy + cut);
      ctx.closePath();

      const cardGrad = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
      cardGrad.addColorStop(0, isHovered ? '#1e293b' : '#0f172a');
      cardGrad.addColorStop(1, '#070c18');
      ctx.fillStyle = cardGrad;
      ctx.fill();

      ctx.strokeStyle = rarityColor;
      ctx.lineWidth = isHovered ? 3.0 : 2.0;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.font = '38px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(relic.icon, cx + 55, cy + 70);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 21px sans-serif';
      ctx.fillText(relic.name, cx + 105, cy + 46);

      ctx.fillStyle = rarityColor;
      ctx.font = 'bold 12px sans-serif';
      const nameWidth = ctx.measureText(relic.name).width;
      ctx.fillText(`[${rarityLabel}]`, cx + 115 + nameWidth, cy + 46);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText(relic.description, cx + 105, cy + 80);

      ctx.fillStyle = isHovered ? '#ffffff' : rarityColor;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(isHovered ? '★ 點擊立即裝備 ★' : '▶ 點擊選擇此遺物', cx + 105, cy + 112);

      ctx.restore();
    }

    ctx.restore();
  }

  // 暫停選單彈窗
  private renderPauseMenu(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 12, 0.88)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('PAUSED', w / 2, 420);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText('— 秘境探險暫停 —', w / 2, 460);

    // 按鈕 1: 繼續遊戲 (RESUME) [200, 520, 320, 58]
    ctx.fillStyle = '#0284c7';
    ctx.roundRect(200, 520, 320, 58, 12);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('RESUME (繼續)', w / 2, 556);

    // 按鈕 2: 重新探險 (RESTART) [200, 600, 320, 58]
    ctx.fillStyle = '#334155';
    ctx.roundRect(200, 600, 320, 58, 12);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('RESTART (重開)', w / 2, 636);

    // 按鈕 3: 返回標題 (QUIT TO TITLE) [200, 680, 320, 58]
    ctx.fillStyle = '#1e293b';
    ctx.roundRect(200, 680, 320, 58, 12);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('QUIT (主選單)', w / 2, 716);

    ctx.restore();
  }

  // 首頁標題螢幕 (支援模式選擇與突變因子說明)
  private renderTitleScreen(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    saveData: OrbCascadeSave,
    selectedMode: GameMode
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 8, 16, 0.88)';
    ctx.fillRect(0, 0, w, h);

    // 裝飾外框
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 160, w - 80, h - 300);

    // 標題文字
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('彈珠秘境', w / 2, 245);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px sans-serif';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 18;
    ctx.fillText('連鎖共鳴', w / 2, 300);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('ORB CASCADE • ROGUELIKE PINBALL v1.2.0', w / 2, 335);

    // 歷史最佳紀錄面板
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.roundRect(140, 365, 440, 105, 10);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText('— 歷史探險成就 —', w / 2, 390);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`標準最高分: ${saveData.highScore.toLocaleString()} (第 ${saveData.highestFloor} 層)`, w / 2, 418);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px sans-serif';
    ctx.fillText(`無盡螺旋最高分: ${(saveData.endlessHighScore || 0).toLocaleString()} (第 ${saveData.endlessHighestFloor || 1} 層)`, w / 2, 445);

    // 模式選擇雙切換按鈕 [160, 490, 190, 50] vs [370, 490, 190, 50]
    const isStd = selectedMode === 'STANDARD';
    // 標準模式
    ctx.fillStyle = isStd ? '#0284c7' : '#1e293b';
    ctx.roundRect(160, 490, 190, 50, 10);
    ctx.fill();
    ctx.strokeStyle = isStd ? '#38bdf8' : '#475569';
    ctx.lineWidth = isStd ? 2.5 : 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('🏰 標準秘境', 255, 522);

    // 無盡螺旋模式
    ctx.fillStyle = !isStd ? '#d97706' : '#1e293b';
    ctx.roundRect(370, 490, 190, 50, 10);
    ctx.fill();
    ctx.strokeStyle = !isStd ? '#f59e0b' : '#475569';
    ctx.lineWidth = !isStd ? 2.5 : 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText('🌀 無盡螺旋', 465, 522);

    // 開始遊戲按鈕 [180, 565, 360, 68]
    ctx.shadowColor = isStd ? '#00f3ff' : '#f59e0b';
    ctx.shadowBlur = 20;
    ctx.fillStyle = isStd ? '#0284c7' : '#d97706';
    ctx.roundRect(180, 565, 360, 68, 14);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = isStd ? '#38bdf8' : '#fcd34d';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('START RUN (開始探險)', w / 2, 608);

    // 玩法指引
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText('新增「寒霜/混沌雷球/虛空」三大專屬彈珠，隨時在發射台切換！', w / 2, 665);
    ctx.fillText('底部滑動集球桶具備「動態 Jackpot 倍率槽」，接住贏取金色禮花！', w / 2, 690);
    ctx.fillText('Boss 血量低於 30% 觸發狂暴咆哮，請全力連鎖破盾擊潰！', w / 2, 715);

    ctx.restore();
  }

  // 失敗結算畫面
  private renderGameOver(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    finalScore: number,
    floorLevel: number,
    saveData: OrbCascadeSave,
    gameMode: GameMode
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 5, 10, 0.93)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('探險終結', w / 2, 340);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '18px sans-serif';
    const modeLabel = gameMode === 'ENDLESS' ? '無盡螺旋' : '秘境';
    ctx.fillText(`你在${modeLabel}第 ${floorLevel} 層力竭倒下...`, w / 2, 400);

    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.roundRect(140, 440, 440, 160, 12);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`本次結算得分: ${finalScore.toLocaleString()}`, w / 2, 490);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px sans-serif';
    const bestScore = gameMode === 'ENDLESS' ? (saveData.endlessHighScore || 0) : saveData.highScore;
    ctx.fillText(`該模式最高分: ${bestScore.toLocaleString()}`, w / 2, 530);
    ctx.fillText(`最深探索層數: 第 ${floorLevel} 層`, w / 2, 565);

    // 重新挑戰按鈕 [200, 650, 320, 64]
    ctx.fillStyle = '#dc2626';
    ctx.roundRect(200, 650, 320, 64, 12);
    ctx.fill();
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('重新挑戰 (RETRY)', w / 2, 690);

    ctx.restore();
  }

  // 征服通關畫面
  private renderVictory(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    finalScore: number,
    saveData: OrbCascadeSave
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 18, 12, 0.94)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('秘境征服！', w / 2, 320);

    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('你成功擊潰了混沌虛空古龍，解開了共鳴之秘！', w / 2, 380);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6, 78, 59, 0.6)';
    ctx.roundRect(140, 430, 440, 160, 12);
    ctx.fill();
    ctx.strokeStyle = '#34d399';
    ctx.stroke();

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`終極得分: ${finalScore.toLocaleString()}`, w / 2, 485);

    ctx.fillStyle = '#a7f3d0';
    ctx.font = '16px sans-serif';
    ctx.fillText(`通關用時與全滅記錄已妥善封存！`, w / 2, 530);
    ctx.fillText(`歷史最佳最高分: ${saveData.highScore.toLocaleString()}`, w / 2, 560);

    // 榮耀返程按鈕 [200, 640, 320, 64]
    ctx.fillStyle = '#059669';
    ctx.roundRect(200, 640, 320, 64, 12);
    ctx.fill();
    ctx.strokeStyle = '#6ee7b7';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('榮耀返程 (RETURN)', w / 2, 680);

    ctx.restore();
  }
}
