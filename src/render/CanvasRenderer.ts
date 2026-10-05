import { ORB_PHYSICS, COMBO_LADDER } from '../core/Constants';
import { Peg } from '../entities/Peg';
import { Orb } from '../entities/Orb';
import { Bucket } from '../entities/Bucket';
import { Monster } from '../entities/Monster';
import { Relic, TrajectoryPoint, GameState, OrbCascadeSave } from '../types';
import { ParticleSystem } from './ParticleSystem';
import { FloatingCombatText } from './FloatingCombatText';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;

  // 螢幕震動參數
  private shakeIntensity = 0;
  private shakeDecay = 8.5;
  private shakeTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context not supported');
    this.ctx = context;
  }

  public triggerShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  public update(dt: number): void {
    if (this.shakeIntensity > 0) {
      this.shakeTime += dt;
      this.shakeIntensity -= this.shakeDecay * dt * this.shakeIntensity;
      if (this.shakeIntensity < 0.1) {
        this.shakeIntensity = 0;
        this.shakeTime = 0;
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

    // 2. 清除畫布並繪製地下秘境暗色背景
    this.renderBackground(ctx, w, h);

    // 3. 釘盤與邊界引導槽
    this.renderBorders(ctx);
    this.renderPegs(ctx, pegs);

    // 4. 底部移動集球桶
    this.renderBucket(ctx, bucket);

    // 5. 瞄準砲台與預測虛線 (僅在瞄準狀態且有彈珠時)
    if (state === 'BATTLE_AIM') {
      this.renderAimCannon(ctx, aimAngleRad, trajectory, isAiming);
    }

    // 6. 魔法彈珠繪製
    this.renderOrbs(ctx, orbs);

    // 7. 粒子系統與浮動傷害數字
    particles.render(ctx);
    combatText.render(ctx);

    // 8. 頂部 HUD (血量、分數、Boss 血條、連鎖倍率、剩餘彈珠)
    this.renderHUD(ctx, monster, floorLevel, playerHp, manaOrbs, totalScore, turnScore, comboHits, relics, saveData.isMuted);

    // 9. 依據遊戲狀態繪製各視窗與疊層
    if (state === 'TITLE') {
      this.renderTitleScreen(ctx, w, h, saveData);
    } else if (state === 'RELIC_DRAFT') {
      this.renderRelicDraft(ctx, w, h, draftRelics);
    } else if (state === 'GAME_OVER') {
      this.renderGameOver(ctx, w, h, totalScore, floorLevel, saveData);
    } else if (state === 'VICTORY') {
      this.renderVictory(ctx, w, h, totalScore, saveData);
    }

    ctx.restore();
  }

  private renderBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0d111d');
    grad.addColorStop(0.3, '#101626');
    grad.addColorStop(0.7, '#0b0e18');
    grad.addColorStop(1, '#05070c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 背景微弱裝飾魔導陣
    ctx.save();
    ctx.strokeStyle = 'rgba(70, 110, 200, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(360, 600, 260, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(360, 600, 160, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private renderBorders(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = '#253352';
    ctx.lineWidth = 4;

    // 兩側牆壁導軌
    ctx.beginPath();
    // 左壁
    ctx.moveTo(ORB_PHYSICS.WALL_LEFT, ORB_PHYSICS.CEILING_TOP);
    ctx.lineTo(ORB_PHYSICS.WALL_LEFT, 1080);
    ctx.lineTo(ORB_PHYSICS.WALL_LEFT + 60, 1220); // 漏斗收窄
    ctx.lineTo(ORB_PHYSICS.WALL_LEFT + 120, 1240);

    // 右壁
    ctx.moveTo(ORB_PHYSICS.WALL_RIGHT, ORB_PHYSICS.CEILING_TOP);
    ctx.lineTo(ORB_PHYSICS.WALL_RIGHT, 1080);
    ctx.lineTo(ORB_PHYSICS.WALL_RIGHT - 60, 1220);
    ctx.lineTo(ORB_PHYSICS.WALL_RIGHT - 120, 1240);
    ctx.stroke();

    // 兩側落溝標記死區
    ctx.fillStyle = 'rgba(255, 60, 60, 0.15)';
    ctx.fillRect(0, 1230, 240, 50);
    ctx.fillRect(480, 1230, 240, 50);

    ctx.restore();
  }

  private renderPegs(ctx: CanvasRenderingContext2D, pegs: Peg[]): void {
    for (const peg of pegs) {
      if (peg.isDestroyed) continue;

      let baseColor = '#00f3ff';
      let shadowColor = '#00f3ff';
      let glowSize = 10;

      switch (peg.type) {
        case 'WEAKPOINT':
          baseColor = '#ffd700';
          shadowColor = '#ffbb00';
          glowSize = 14 + Math.sin(peg.glowPhase) * 4;
          break;
        case 'TNT':
          baseColor = '#ff3311';
          shadowColor = '#ff5522';
          glowSize = 16 + Math.sin(peg.glowPhase) * 3;
          break;
        case 'MUSHROOM':
          baseColor = '#e040fb';
          shadowColor = '#aa00ff';
          glowSize = 18;
          break;
        case 'PORTAL':
          baseColor = '#3b82f6';
          shadowColor = '#8b5cf6';
          glowSize = 20;
          break;
        case 'RESET':
          baseColor = '#facc15';
          shadowColor = '#fbbf24';
          glowSize = 18 + Math.sin(peg.glowPhase * 2) * 5;
          break;
        default:
          baseColor = peg.isHitThisTurn ? '#3a4a63' : '#00e5ff';
          shadowColor = peg.isHitThisTurn ? '#202936' : '#00b4d8';
          glowSize = peg.isHitThisTurn ? 2 : 8;
          break;
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
      ctx.fillStyle = peg.hitFlashTimer > 0 ? '#ffffff' : (peg.isHitThisTurn ? '#607085' : '#ffffff');
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
      }

      ctx.restore();
    }
  }

  private renderBucket(ctx: CanvasRenderingContext2D, bucket: Bucket): void {
    ctx.save();
    const bx = bucket.x;
    const by = bucket.y;
    const bw = bucket.width;
    const bh = bucket.height;

    // 集球桶底部發光
    ctx.shadowColor = bucket.isFrozen ? '#38bdf8' : '#10b981';
    ctx.shadowBlur = 16;
    ctx.fillStyle = bucket.isFrozen ? '#1e293b' : '#064e3b';
    ctx.strokeStyle = bucket.isFrozen ? '#7dd3fc' : '#34d399';
    ctx.lineWidth = 3;

    // 圓角梯形/矩形
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2, by - bh / 2, bw, bh, 8);
    ctx.fill();
    ctx.stroke();

    // 文字
    ctx.shadowBlur = 0;
    ctx.fillStyle = bucket.isFrozen ? '#e0f2fe' : '#a7f3d0';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bucket.isFrozen ? 'FROZEN' : 'FREE BALL', bx, by);

    ctx.restore();
  }

  private renderAimCannon(
    ctx: CanvasRenderingContext2D,
    aimAngleRad: number,
    trajectory: TrajectoryPoint[],
    isAiming: boolean
  ): void {
    const cx = ORB_PHYSICS.CANNON_X;
    const cy = ORB_PHYSICS.CANNON_Y;

    ctx.save();

    // 1. 預測虛線軌跡
    if (trajectory.length > 1) {
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = isAiming ? 'rgba(0, 243, 255, 0.85)' : 'rgba(0, 243, 255, 0.45)';

      ctx.beginPath();
      ctx.moveTo(trajectory[0].x, trajectory[0].y);
      for (let i = 1; i < trajectory.length; i++) {
        const pt = trajectory[i];
        ctx.lineTo(pt.x, pt.y);
        if (pt.isBounce) {
          // 折射點畫圓圈光標
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#ffd700';
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. 旋轉發射砲台本體
    ctx.translate(cx, cy);
    ctx.rotate(aimAngleRad);

    // 砲管
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(0, -12, 42, 24, 6);
    ctx.fill();
    ctx.stroke();

    // 砲台基座圓球
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 裝填的魔法球微光
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderOrbs(ctx: CanvasRenderingContext2D, orbs: Orb[]): void {
    for (const orb of orbs) {
      if (orb.isDead) continue;

      ctx.save();

      // 拖尾光線
      if (orb.trail.length > 1) {
        ctx.lineWidth = orb.radius * 0.8;
        ctx.lineCap = 'round';
        for (let i = 0; i < orb.trail.length - 1; i++) {
          const p1 = orb.trail[i];
          const p2 = orb.trail[i + 1];
          const alpha = (i / orb.trail.length) * 0.45;
          ctx.strokeStyle = orb.isSecondary
            ? `rgba(245, 158, 11, ${alpha})`
            : `rgba(0, 243, 255, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // 彈珠外光暈
      ctx.shadowColor = orb.isSecondary ? '#f59e0b' : '#00f3ff';
      ctx.shadowBlur = 18;
      ctx.fillStyle = orb.isSecondary ? '#fbbf24' : '#38bdf8';
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
    ctx.fillStyle = 'rgba(8, 12, 22, 0.92)';
    ctx.fillRect(0, 0, ORB_PHYSICS.VIRTUAL_WIDTH, 140);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 140);
    ctx.lineTo(ORB_PHYSICS.VIRTUAL_WIDTH, 140);
    ctx.stroke();

    // 1. 玩家生命值 (Player HP)
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

    // 3. 怪物名稱與血量條 (Boss / Monster Bar)
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

    // 怪物攻擊倒數計時圖標
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`⚔️ 倒數 ${monster.data.currentCountdown} 回合`, 696, 68);

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

    // Combo 標籤與倍率
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

    // 7. 右上角靜音開關按鈕
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fillRect(652, 92, 44, 30);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(652, 92, 44, 30);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '16px sans-serif';
    ctx.fillText(isMuted ? '🔇' : '🔊', 674, 112);

    ctx.restore();
  }

  private renderTitleScreen(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    saveData: OrbCascadeSave
  ): void {
    ctx.save();
    // 半透明背景覆蓋
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
    ctx.fillText('ORB CASCADE • ROGUELIKE PINBALL', w / 2, 375);

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
    ctx.fillText('擊破每層怪物可挑選肉鴿遺物，挑戰終極古龍！', w / 2, 750);

    ctx.restore();
  }

  private renderRelicDraft(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    draftRelics: Relic[]
  ): void {
    ctx.save();
    ctx.fillStyle = 'rgba(6, 8, 16, 0.92)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('秘境寶藏：挑選一項神祕遺物', w / 2, 280);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px sans-serif';
    ctx.fillText('點擊下方卡牌將其裝備至流派道具欄 (最多 6 款)', w / 2, 315);

    // 三張卡牌
    const cardY = 360;
    const cardW = 540;
    const cardH = 135;
    const cardSpacing = 160;

    for (let i = 0; i < draftRelics.length; i++) {
      const relic = draftRelics[i];
      const y = cardY + i * cardSpacing;

      // 卡牌底框
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.roundRect(90, y, cardW, cardH, 12);
      ctx.fill();

      // 卡牌邊框發光
      ctx.strokeStyle = relic.iconColor;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 圖示
      ctx.font = '36px sans-serif';
      ctx.fillText(relic.icon, 140, y + 68);

      // 遺物名稱
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(relic.name, 190, y + 48);

      // 稀有度標籤
      ctx.fillStyle = relic.iconColor;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`[${relic.rarity}]`, 190 + relic.name.length * 22, y + 48);

      // 描述文字
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText(relic.description, 190, y + 84);

      // 點擊領取按鈕提示
      ctx.fillStyle = relic.iconColor;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('▶ 點擊選擇此遺物', 190, y + 114);

      ctx.textAlign = 'center';
    }

    ctx.restore();
  }

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

    // 重新挑戰按鈕
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

    // 成績清單
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

    // 重新探險按鈕
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
