import { ORB_PHYSICS, COMBO_LADDER } from '../core/Constants';
import { Peg } from '../entities/Peg';
import { Orb } from '../entities/Orb';
import { Bucket } from '../entities/Bucket';
import { Monster } from '../entities/Monster';
import { Relic, TrajectoryPoint, GameState, OrbCascadeSave } from '../types';
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

  // 當前鼠標/觸控懸停卡牌索引
  public hoveredCardIndex = -1;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context not supported');
    this.ctx = context;

    // 初始化 65 顆深邃背景飄浮星塵
    for (let i = 0; i < 65; i++) {
      this.starDustList.push({
        x: Math.random() * ORB_PHYSICS.VIRTUAL_WIDTH,
        y: Math.random() * ORB_PHYSICS.VIRTUAL_HEIGHT,
        size: 1.0 + Math.random() * 2.2,
        speedX: (Math.random() - 0.5) * 12,
        speedY: -8 - Math.random() * 20, // 緩慢向上微飄
        alpha: 0.3 + Math.random() * 0.5,
        baseAlpha: 0.3 + Math.random() * 0.4,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  public triggerShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
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

    // 更新背景飄浮星塵
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
    draftRelics: Relic[] = []
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

    // 2. 清除畫布並繪製動態星雲與深邃秘境背景
    this.renderBackground(ctx, w, h);

    // 3. 釘盤與邊界引導槽
    this.renderBorders(ctx);
    this.renderPegs(ctx, pegs, monster);

    // 4. 底部移動集球桶
    this.renderBucket(ctx, bucket);

    // 5. 瞄準砲台、動態流光預測線與共振漣漪光環 (僅在瞄準狀態且有彈珠時)
    if (state === 'BATTLE_AIM') {
      this.renderAimCannon(ctx, aimAngleRad, trajectory, isAiming);
    }

    // 6. 魔法彈珠繪製 (含過載電弧拖尾)
    this.renderOrbs(ctx, orbs);

    // 7. 粒子系統與浮動傷害數字
    particles.render(ctx);
    combatText.render(ctx);

    // 8. 頂部 HUD (血量、分數、Boss 能量護盾條、連鎖倍率、剩餘彈珠、靜音/暫停按鈕)
    this.renderHUD(ctx, monster, floorLevel, playerHp, manaOrbs, totalScore, turnScore, comboHits, relics, saveData.isMuted);

    // 9. 依據遊戲狀態繪製各視窗與疊層
    if (state === 'TITLE') {
      this.renderTitleScreen(ctx, w, h, saveData);
    } else if (state === 'RELIC_DRAFT') {
      this.renderRelicDraft(ctx, w, h, draftRelics);
    } else if (state === 'PAUSED') {
      this.renderPauseMenu(ctx, w, h);
    } else if (state === 'GAME_OVER') {
      this.renderGameOver(ctx, w, h, totalScore, floorLevel, saveData);
    } else if (state === 'VICTORY') {
      this.renderVictory(ctx, w, h, totalScore, saveData);
    }

    ctx.restore();
  }

  // 1. 動態星雲漸層與飄動星塵背景
  private renderBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // 基礎暗夜星空底色
    ctx.fillStyle = '#060810';
    ctx.fillRect(0, 0, w, h);

    // 動態深邃星雲 1 (深藍紫羅蘭)
    const t = this.visualTime * 0.3;
    const neb1X = w * 0.35 + Math.sin(t) * 90;
    const neb1Y = h * 0.45 + Math.cos(t * 0.8) * 110;
    const grad1 = ctx.createRadialGradient(neb1X, neb1Y, 40, neb1X, neb1Y, 480);
    grad1.addColorStop(0, 'rgba(30, 27, 75, 0.45)');
    grad1.addColorStop(0.5, 'rgba(15, 23, 42, 0.28)');
    grad1.addColorStop(1, 'rgba(6, 8, 16, 0)');
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, w, h);

    // 動態深邃星雲 2 (青玉幽光)
    const neb2X = w * 0.7 - Math.cos(t * 0.7) * 80;
    const neb2Y = h * 0.65 + Math.sin(t * 0.9) * 90;
    const grad2 = ctx.createRadialGradient(neb2X, neb2Y, 30, neb2X, neb2Y, 420);
    grad2.addColorStop(0, 'rgba(12, 74, 110, 0.35)');
    grad2.addColorStop(0.6, 'rgba(8, 47, 73, 0.15)');
    grad2.addColorStop(1, 'rgba(6, 8, 16, 0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, w, h);

    // 飄動星塵微粒 (Star Dust)
    ctx.save();
    for (const star of this.starDustList) {
      ctx.globalAlpha = Math.max(0, Math.min(1, star.alpha));
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 秘境古老神秘同心魔導陣
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(360, 620, 270, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(168, 85, 247, 0.05)';
    ctx.beginPath();
    ctx.arc(360, 620, 170, 0, Math.PI * 2);
    ctx.stroke();

    // 旋轉符文微刻線
    const ringAngle = this.visualTime * 0.08;
    ctx.save();
    ctx.translate(360, 620);
    ctx.rotate(ringAngle);
    ctx.setLineDash([8, 14]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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

  // 3. 釘盤與機關釘繪製 (弱點爆擊釘呼吸金圈、Boss 護盾核心連線、小怪干擾釘)
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

        // 弱點爆擊釘專屬：呼吸脈衝金色光圈 (外圍呼吸光環)
        ctx.save();
        const pulseRatio = 0.5 + 0.5 * Math.sin(this.visualTime * 5 + peg.id);
        const pulseR = peg.radius * (1.6 + pulseRatio * 0.5);
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.35 + pulseRatio * 0.45})`;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();

        // 旋轉星芒小光點
        const starAngle = this.visualTime * 2 + peg.id;
        const starX = peg.x + Math.cos(starAngle) * (pulseR + 1);
        const starY = peg.y + Math.sin(starAngle) * (pulseR + 1);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(starX, starY, 1.8, 0, Math.PI * 2);
        ctx.fill();
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
          ctx.lineTo(600, 40); // 頂部 Boss 護盾條位置
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

        // 小怪干擾釘外刺光環
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

  // 4. 移動集球桶
  private renderBucket(ctx: CanvasRenderingContext2D, bucket: Bucket): void {
    ctx.save();
    const bx = bucket.x;
    const by = bucket.y;
    const bw = bucket.width;
    const bh = bucket.height;

    // 集球桶底部發光
    ctx.shadowColor = bucket.isFrozen ? '#38bdf8' : '#10b981';
    ctx.shadowBlur = 18;
    ctx.fillStyle = bucket.isFrozen ? '#1e293b' : '#064e3b';
    ctx.strokeStyle = bucket.isFrozen ? '#7dd3fc' : '#34d399';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = bucket.isFrozen ? '#e0f2fe' : '#a7f3d0';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bucket.isFrozen ? 'FROZEN' : 'FREE BALL', bx, by);

    ctx.restore();
  }

  // 5. 瞄準砲台、動態流光預測線與落點共振漣漪光環、虛擬拉桿反饋
  private renderAimCannon(
    ctx: CanvasRenderingContext2D,
    aimAngleRad: number,
    trajectory: TrajectoryPoint[],
    isAiming: boolean
  ): void {
    const cx = ORB_PHYSICS.CANNON_X;
    const cy = ORB_PHYSICS.CANNON_Y;

    ctx.save();

    // 1. 動態流光 3 次折射預測線
    if (trajectory.length > 1) {
      ctx.lineWidth = isAiming ? 3.0 : 2.2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -this.aimStreamOffset; // 動態奔馳流光
      ctx.strokeStyle = isAiming ? 'rgba(0, 243, 255, 0.95)' : 'rgba(0, 243, 255, 0.55)';
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = isAiming ? 12 : 5;

      ctx.beginPath();
      ctx.moveTo(trajectory[0].x, trajectory[0].y);
      for (let i = 1; i < trajectory.length; i++) {
        const pt = trajectory[i];
        ctx.lineTo(pt.x, pt.y);

        if (pt.isBounce) {
          ctx.stroke();
          // 反彈折射點處的光標
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

      // 落點處增加能量共振漣漪光環 (Resonance Ripples)
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

    // 2. 手機與桌面操作優化：拖曳拉桿指針與弧度反饋
    ctx.save();
    ctx.translate(cx, cy);

    // 瞄準角度範圍導引弧線
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 56, (15 * Math.PI) / 180, (165 * Math.PI) / 180);
    ctx.stroke();

    // 旋轉發射砲台
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
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // 瞄準時發射箭頭指引光芒
    if (isAiming) {
      ctx.fillStyle = '#00f3ff';
      ctx.shadowColor = '#00f3ff';
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

  // 6. 魔法彈珠繪製
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

      // 彈珠外光暈
      let glow = '#00f3ff';
      let ballFill = '#38bdf8';
      if (orb.isOvercharged) {
        glow = '#22c55e';
        ballFill = '#4ade80';
      } else if (orb.isMiniBullet) {
        glow = '#06b6d4';
        ballFill = '#67e8f9';
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

      // 彈珠核心白光
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // 8. 頂部 HUD (包含 Boss 能量護盾條、暫停按鈕、音效按鈕)
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
    isMuted: boolean
  ): void {
    ctx.save();

    // 頂部儀表板背景黑框
    ctx.fillStyle = 'rgba(8, 12, 22, 0.94)';
    ctx.fillRect(0, 0, ORB_PHYSICS.VIRTUAL_WIDTH, 140);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
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
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`FLOOR ${floorLevel < 10 ? '0' + floorLevel : floorLevel} / 10`, 360, 26);

    // 3. 怪物名稱與血量條
    ctx.textAlign = 'right';
    ctx.fillStyle = monster.data.isBoss ? '#f43f5e' : '#cbd5e1';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(monster.data.name, 696, 26);

    const mHpW = 160;
    const mHpH = 14;
    const mHpX = 696 - mHpW;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(mHpX, 34, mHpW, mHpH);

    const mRatio = Math.max(0, monster.data.currentHp / monster.data.maxHp);
    ctx.fillStyle = monster.hurtTimer > 0 ? '#ffffff' : (monster.data.isBoss ? '#e11d48' : '#8b5cf6');
    ctx.fillRect(mHpX, 34, mHpW * mRatio, mHpH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${monster.data.currentHp} / ${monster.data.maxHp}`, 690, 45);

    // Boss 能量護盾條 (若 Boss 有護盾)
    if (monster.data.isBoss && monster.data.hasShield) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px sans-serif';
      let shieldIcons = '';
      for (let s = 0; s < monster.data.shieldCurrent; s++) shieldIcons += '🛡️';
      ctx.fillText(`SHIELD (${monster.data.shieldCurrent}/${monster.data.shieldMax}) ${shieldIcons}`, 696, 62);
    } else {
      // 怪物攻擊倒數計時圖標
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`⚔️ 倒數 ${monster.data.currentCountdown} 回合`, 696, 64);
    }

    // 4. 剩餘魔法彈珠 (Mana Orbs)
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
    ctx.fillText(`SCORE: ${totalScore.toLocaleString()}`, 360, 52);

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
      ctx.fillText(`${comboHits}x [${comboMultiplier.toFixed(2)}x] ${comboLabel}`, 360, 78);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText(`本輪累積傷害: +${turnScore}`, 360, 96);
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
    // 暫停按鈕
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.fillRect(598, 92, 44, 30);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(598, 92, 44, 30);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px sans-serif';
    ctx.fillText('⏸️', 620, 112);

    // 靜音按鈕
    ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
    ctx.fillRect(652, 92, 44, 30);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(652, 92, 44, 30);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '15px sans-serif';
    ctx.fillText(isMuted ? '🔇' : '🔊', 674, 112);

    ctx.restore();
  }

  // 9. 重新打磨的 3 選 1 遺物抽卡介面 (幾何邊框、稀有度光暈、懸停反饋)
  private renderRelicDraft(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    draftRelics: Relic[]
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 14, 0.94)';
    ctx.fillRect(0, 0, w, h);

    // 標題與裝飾
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

      // 稀有度色彩定義
      let rarityColor = '#10b981'; // COMMON
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

      // 卡牌外光暈 (稀有度光暈 + 懸停加強)
      ctx.shadowColor = rarityColor;
      ctx.shadowBlur = isHovered ? 28 : 14;

      // 精緻幾何切角邊框卡牌
      const cx = 85;
      const cy = y;
      const cw = cardW;
      const ch = cardH;
      const cut = 16; // 斜切角大小

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

      // 底板漸層
      const cardGrad = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
      cardGrad.addColorStop(0, isHovered ? '#1e293b' : '#0f172a');
      cardGrad.addColorStop(1, '#070c18');
      ctx.fillStyle = cardGrad;
      ctx.fill();

      // 雙層幾何科技邊框
      ctx.strokeStyle = rarityColor;
      ctx.lineWidth = isHovered ? 3.0 : 2.0;
      ctx.stroke();

      // 內部裝飾小切角
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 8, cy + 24);
      ctx.lineTo(cx + 8, cy + 8);
      ctx.lineTo(cx + 24, cy + 8);
      ctx.stroke();

      // 遺物圖示
      ctx.font = '38px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(relic.icon, cx + 55, cy + 70);

      // 遺物名稱
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 21px sans-serif';
      ctx.fillText(relic.name, cx + 105, cy + 46);

      // 稀有度光芒徽章
      ctx.fillStyle = rarityColor;
      ctx.font = 'bold 12px sans-serif';
      const nameWidth = ctx.measureText(relic.name).width;
      ctx.fillText(`[${rarityLabel}]`, cx + 115 + nameWidth, cy + 46);

      // 遺物描述文字
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText(relic.description, cx + 105, cy + 80);

      // 點擊選擇按鈕導引
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

  // 首頁標題螢幕
  private renderTitleScreen(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    saveData: OrbCascadeSave
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 8, 16, 0.88)';
    ctx.fillRect(0, 0, w, h);

    // 裝飾外框
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 180, w - 80, h - 360);

    // 標題文字
    ctx.textAlign = 'center';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('彈珠秘境', w / 2, 280);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px sans-serif';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 18;
    ctx.fillText('連鎖共鳴', w / 2, 335);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('ORB CASCADE • ROGUELIKE PINBALL v1.1.0', w / 2, 375);

    // 歷史最佳紀錄面板
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    ctx.roundRect(140, 420, 440, 110, 10);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('— 歷史探險成就 —', w / 2, 450);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`最高得分: ${saveData.highScore.toLocaleString()}`, w / 2, 480);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px sans-serif';
    ctx.fillText(`最深探索: 第 ${saveData.highestFloor} 層  |  累計擊殺: ${saveData.totalKills} 隻`, w / 2, 510);

    // 開始遊戲按鈕
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#0284c7';
    ctx.roundRect(180, 580, 360, 68, 14);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('START RUN (開始探險)', w / 2, 622);

    // 玩法指引
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px sans-serif';
    ctx.fillText('滑鼠拖曳或手機觸控拉桿瞄準，鬆手發射魔法彈珠', w / 2, 700);
    ctx.fillText('擊破弱點釘引發 3 倍爆擊，落入移動集球桶可保留彈珠！', w / 2, 725);
    ctx.fillText('擊破 Boss 護盾核心釘以瓦解其無敵力場，迎擊 10 層巨獸！', w / 2, 750);

    ctx.restore();
  }

  // 失敗結算畫面
  private renderGameOver(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    finalScore: number,
    floorLevel: number,
    saveData: OrbCascadeSave
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
    ctx.fillText(`你在秘境第 ${floorLevel} 層力竭倒下...`, w / 2, 400);

    // 成績清單
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
    ctx.fillText(`歷史最高分: ${saveData.highScore.toLocaleString()}`, w / 2, 530);
    ctx.fillText(`最深探索層數: 第 ${saveData.highestFloor} 層`, w / 2, 565);

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
