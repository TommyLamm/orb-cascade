import { ORB_PHYSICS, COMBO_LADDER, CHALLENGE_MODIFIERS, SPECIAL_ORBS_CONFIG } from './Constants';
import { GameState, Relic, TrajectoryPoint, OrbCascadeSave, OrbType, GameMode, ChallengeModifier } from '../types';
import { Peg } from '../entities/Peg';
import { Orb, CollisionEvent } from '../entities/Orb';
import { Bucket } from '../entities/Bucket';
import { RelicManager } from '../entities/RelicManager';
import { PegboardGenerator } from '../level/PegboardGenerator';
import { DungeonProgress } from '../level/DungeonProgress';
import { SoundEngine } from '../audio/SoundEngine';
import { ProceduralMusic } from '../audio/ProceduralMusic';
import { CanvasRenderer } from '../render/CanvasRenderer';
import { ParticleSystem } from '../render/ParticleSystem';
import { FloatingCombatText } from '../render/FloatingCombatText';
import { InputManager } from './InputManager';
import { StorageManager } from './StorageManager';
import { PlayroomService } from './PlayroomService';
import { GameLoop } from './GameLoop';

export class GameApp {
  private state: GameState = 'BOOT';
  private previousState: GameState = 'BATTLE_AIM';
  private pegs: Peg[] = [];
  private orbs: Orb[] = [];
  private bucket: Bucket = new Bucket();
  private dungeon: DungeonProgress = new DungeonProgress('STANDARD');
  private relicManager: RelicManager = new RelicManager();

  private soundEngine: SoundEngine;
  private music: ProceduralMusic;
  private renderer: CanvasRenderer;
  private particles: ParticleSystem = new ParticleSystem();
  private combatText: FloatingCombatText = new FloatingCombatText();
  private inputManager: InputManager;
  private gameLoop: GameLoop;
  private saveData: OrbCascadeSave;

  // 遊戲模式與突變因子
  private selectedGameMode: GameMode = 'STANDARD';
  private activeModifiers: readonly ChallengeModifier[] = [];

  // 特殊彈珠
  private equippedOrb: OrbType = 'STANDARD';
  private unlockedOrbs: OrbType[] = ['STANDARD', 'FROST', 'LIGHTNING', 'VOID'];

  // 當前回合戰鬥狀態數據
  private comboHits = 0;
  private turnScore = 0;
  private currentRunId: string | null = null;
  private draftRelics: Relic[] = [];
  private trajectoryPoints: TrajectoryPoint[] = [];

  // 吸血尖牙累計計數
  private vampireHitCounter = 0;

  // 延遲發射雙重魔彈定時器
  private twinOrbLaunchTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.soundEngine = new SoundEngine();
    this.music = new ProceduralMusic(this.soundEngine);
    this.renderer = new CanvasRenderer(canvas);
    this.saveData = StorageManager.load();

    // 讀取存檔中的彈珠與設定
    this.equippedOrb = this.saveData.equippedOrb || 'STANDARD';
    this.unlockedOrbs = this.saveData.unlockedOrbs || ['STANDARD', 'FROST', 'LIGHTNING', 'VOID'];

    // 同步靜音設定
    this.soundEngine.setMuted(this.saveData.isMuted);

    this.inputManager = new InputManager(canvas, () => {
      this.soundEngine.unlock();
      this.music.start();
    });

    this.gameLoop = new GameLoop(this.update, this.render);
  }

  public async init(): Promise<void> {
    await PlayroomService.init();
    this.state = 'TITLE';
    this.pegs = PegboardGenerator.generate(1);
    this.gameLoop.start();
  }

  private update = (dt: number): void => {
    // 阻尼輸入平滑演進
    this.inputManager.update(dt);

    // 處理點擊與介面按鈕交互
    this.handleInputClicks();

    // 更新音效與粒子、飄字系統
    this.particles.update(dt);
    this.combatText.update(dt);
    this.renderer.update(dt);

    // 抽卡狀態下的懸停反饋更新
    if (this.state === 'RELIC_DRAFT') {
      const hPos = this.inputManager.hoverPos;
      let hoveredIndex = -1;
      for (let i = 0; i < this.draftRelics.length; i++) {
        const cardY = 360 + i * 165;
        if (hPos.x >= 85 && hPos.x <= 635 && hPos.y >= cardY && hPos.y <= cardY + 138) {
          hoveredIndex = i;
          break;
        }
      }
      this.renderer.hoveredCardIndex = hoveredIndex;
    } else {
      this.renderer.hoveredCardIndex = -1;
    }

    if (this.state === 'PAUSED') {
      return;
    }

    for (const peg of this.pegs) {
      peg.update(dt);
    }
    this.dungeon.currentMonster.update(dt);

    // 依據不同遊戲狀態進行邏輯演進
    switch (this.state) {
      case 'TITLE':
        this.bucket.update(dt);
        break;

      case 'BATTLE_AIM':
        this.bucket.update(dt);
        this.updateAimTrajectory();

        if (this.inputManager.consumeLaunch() && this.dungeon.manaOrbs > 0) {
          this.launchManaOrb();
        }
        break;

      case 'BATTLE_SIMULATING':
        this.bucket.update(dt);
        this.updateSimulating(dt);
        break;

      case 'TURN_RESOLVE':
        this.resolveTurn();
        break;

      case 'RELIC_DRAFT':
      case 'GAME_OVER':
      case 'VICTORY':
        break;
    }
  };

  private handleInputClicks(): void {
    let click = this.inputManager.popClick();
    while (click) {
      const { x, y } = click;

      // 1. 右上角靜音開關按鈕: [652, 92, 44, 30]
      if (x >= 645 && x <= 700 && y >= 85 && y <= 130) {
        this.toggleMute();
      }

      // 2. 右上角暫停按鈕: [598, 92, 44, 30]
      if (x >= 590 && x <= 645 && y >= 85 && y <= 130) {
        if (this.state === 'BATTLE_AIM' || this.state === 'BATTLE_SIMULATING') {
          this.soundEngine.playButtonClick();
          this.inputManager.cancelAim();
          this.previousState = this.state;
          this.state = 'PAUSED';
        }
      }

      if (this.state === 'PAUSED') {
        // RESUME 按鈕: [200, 520, 320, 58]
        if (x >= 200 && x <= 520 && y >= 520 && y <= 578) {
          this.soundEngine.playButtonClick();
          this.state = this.previousState;
        }
        // RESTART 按鈕: [200, 600, 320, 58]
        else if (x >= 200 && x <= 520 && y >= 600 && y <= 658) {
          this.soundEngine.playButtonClick();
          this.startNewRun();
        }
        // QUIT TO TITLE 按鈕: [200, 680, 320, 58]
        else if (x >= 200 && x <= 520 && y >= 680 && y <= 738) {
          this.soundEngine.playButtonClick();
          this.state = 'TITLE';
        }
      } else if (this.state === 'TITLE') {
        // 模式選擇雙切換按鈕 [160, 490, 190, 50] vs [370, 490, 190, 50]
        if (y >= 490 && y <= 540) {
          if (x >= 160 && x <= 350) {
            this.soundEngine.playButtonClick();
            this.selectedGameMode = 'STANDARD';
          } else if (x >= 370 && x <= 560) {
            this.soundEngine.playButtonClick();
            this.selectedGameMode = 'ENDLESS';
          }
        }
        // START RUN 按鈕: [180, 565, 360, 68]
        if (x >= 180 && x <= 540 && y >= 565 && y <= 635) {
          this.soundEngine.playButtonClick();
          this.startNewRun();
        }
      } else if (this.state === 'BATTLE_AIM') {
        // 特殊彈珠切換按鈕組 [170, 195, 380, 34]
        if (y >= 195 && y <= 230) {
          const startX = 170;
          const btnW = 90;
          const gap = 6;
          for (let i = 0; i < SPECIAL_ORBS_CONFIG.length; i++) {
            const bx = startX + i * (btnW + gap);
            if (x >= bx && x <= bx + btnW) {
              const targetType = SPECIAL_ORBS_CONFIG[i].type;
              if (this.equippedOrb !== targetType) {
                this.soundEngine.playButtonClick();
                this.equippedOrb = targetType;
                this.saveData.equippedOrb = targetType;
                StorageManager.save(this.saveData);
                this.combatText.spawn(`裝備彈珠: ${SPECIAL_ORBS_CONFIG[i].name}`, 360, 245, SPECIAL_ORBS_CONFIG[i].color, 16);
              }
              break;
            }
          }
        }
      } else if (this.state === 'RELIC_DRAFT') {
        // 三選一卡牌按鈕: y 從 360 開始，間隔 165，高 138
        for (let i = 0; i < this.draftRelics.length; i++) {
          const cardY = 360 + i * 165;
          if (x >= 85 && x <= 635 && y >= cardY && y <= cardY + 138) {
            this.soundEngine.playSelectRelic();
            this.chooseRelic(this.draftRelics[i]);
            break;
          }
        }
      } else if (this.state === 'GAME_OVER') {
        // RETRY 按鈕: [200, 650, 320, 64]
        if (x >= 200 && x <= 520 && y >= 650 && y <= 714) {
          this.soundEngine.playButtonClick();
          this.startNewRun();
        }
      } else if (this.state === 'VICTORY') {
        // RETURN 按鈕: [200, 640, 320, 64]
        if (x >= 200 && x <= 520 && y >= 640 && y <= 704) {
          this.soundEngine.playButtonClick();
          this.state = 'TITLE';
        }
      }

      click = this.inputManager.popClick();
    }
  }

  private toggleMute(): void {
    const nextMuted = !this.soundEngine.getIsMuted();
    this.soundEngine.setMuted(nextMuted);
    this.saveData.isMuted = nextMuted;
    StorageManager.save(this.saveData);
  }

  private async startNewRun(): Promise<void> {
    const isEndless = this.selectedGameMode === 'ENDLESS';
    this.activeModifiers = isEndless ? CHALLENGE_MODIFIERS : [];

    let scoreMult = 1.0;
    if (isEndless) {
      for (const m of this.activeModifiers) {
        scoreMult *= m.scoreBonusMultiplier;
      }
    }

    this.dungeon.resetRun(this.selectedGameMode, scoreMult);
    this.relicManager.reset();
    this.bucket.reset();

    const extraShield = isEndless && this.activeModifiers.some((m) => m.id === 'HARDENED_PEGS');
    this.pegs = PegboardGenerator.generate(1, extraShield);
    this.orbs = [];
    this.comboHits = 0;
    this.turnScore = 0;
    this.vampireHitCounter = 0;

    this.currentRunId = await PlayroomService.startRun();
    this.saveData.totalRuns++;
    StorageManager.save(this.saveData);

    this.state = 'BATTLE_AIM';
  }

  private launchManaOrb(): void {
    const angle = this.inputManager.aimAngleRad;
    const speed = ORB_PHYSICS.LAUNCH_SPEED;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    this.comboHits = 0;
    this.turnScore = 0;
    this.orbs = [];

    // 重置釘子本回合擊中標記
    for (const p of this.pegs) {
      p.isHitThisTurn = false;
    }

    // 建立主力彈珠 (帶有專屬類型)
    const mainOrb = new Orb(ORB_PHYSICS.CANNON_X, ORB_PHYSICS.CANNON_Y, vx, vy, this.equippedOrb);
    if (this.relicManager.hasRelic('piercing-spear')) {
      mainOrb.piercingCharges = 2;
    }
    this.orbs.push(mainOrb);

    this.soundEngine.playShoot();
    this.particles.emitSparks(ORB_PHYSICS.CANNON_X, ORB_PHYSICS.CANNON_Y, '#00f3ff', 12);

    // 雙重魔彈遺物機制
    if (this.relicManager.hasRelic('twin-orbs')) {
      this.twinOrbLaunchTimer = 0.08;
    }

    // 遺物「引力導流」設置集球桶寬度
    this.bucket.setExtendedWidth(this.relicManager.hasRelic('gravity-funnel'));

    this.state = 'BATTLE_SIMULATING';
  }

  private updateSimulating(dt: number): void {
    // 雙重魔彈定時觸發
    if (this.twinOrbLaunchTimer > 0) {
      this.twinOrbLaunchTimer -= dt;
      if (this.twinOrbLaunchTimer <= 0) {
        const angle = this.inputManager.aimAngleRad + (Math.random() - 0.5) * 0.08;
        const speed = ORB_PHYSICS.LAUNCH_SPEED * 0.96;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const secondOrb = new Orb(ORB_PHYSICS.CANNON_X, ORB_PHYSICS.CANNON_Y, vx, vy, this.equippedOrb, true);
        this.orbs.push(secondOrb);
        this.soundEngine.playShoot();
      }
    }

    const restitutionMult = this.relicManager.hasRelic('super-gum') ? 1.13 : 1.0;

    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.update(dt, this.pegs, restitutionMult, (event) => this.handleCollision(event, orb));

      // 集球桶接球檢測 (Dynamic Bucket Jackpot)
      const catchResult = this.bucket.checkCatch(orb.x, orb.y, orb.radius);
      if (!orb.isDead && catchResult.caught) {
        orb.isDead = true;
        this.handleBucketCatch(orb, catchResult.reward);
      }
    }

    // 當所有彈珠均死亡或掉出邊界，進入結算階段
    const allDead = this.orbs.every((o) => o.isDead);
    if (allDead && this.twinOrbLaunchTimer <= 0) {
      this.state = 'TURN_RESOLVE';
    }
  }

  private handleCollision(event: CollisionEvent, orb: Orb): void {
    if (event.type === 'WALL') {
      this.particles.emitSparks(event.x, event.y, '#38bdf8', 4, 0.6);
      return;
    }

    const peg = event.peg;
    if (!peg) return;

    // 1. 彈跳魔菇
    if (event.type === 'MUSHROOM') {
      this.soundEngine.playMushroomBounce();
      this.renderer.triggerShake(5);
      this.particles.emitSparks(event.x, event.y, '#e040fb', 16, 1.3);

      if (this.relicManager.hasRelic('overcharge-battery')) {
        orb.isOvercharged = true;
        this.particles.emitOverchargeElectrics(event.x, event.y);
        this.combatText.spawn('⚡ OVERCHARGED! 2X NEXT', event.x, event.y - 18, '#22c55e', 18, true);
      } else {
        this.combatText.spawn('BOUNCE!', event.x, event.y - 15, '#e040fb', 18, true);
      }
      return;
    }

    // 2. 傳送門 (含新遺物「隕石衝擊」全螢幕震波)
    if (event.type === 'PORTAL') {
      this.soundEngine.playPortal();
      this.particles.emitPortalVortex(event.x, event.y);

      if (this.relicManager.hasRelic('meteor-strike')) {
        this.triggerMeteorStrike(event.x, event.y);
      }
      return;
    }

    // 3. 重置金釘
    if (event.type === 'RESET') {
      this.soundEngine.playReset();
      this.renderer.triggerShake(6);
      this.particles.emitCritStars(event.x, event.y, 20);
      this.combatText.spawn('★ RESET ALL! ★', event.x, event.y - 20, '#facc15', 22, true);

      for (const p of this.pegs) {
        if (!p.isDestroyed) {
          p.isHitThisTurn = false;
          p.triggerHitFlash();
        }
      }
      return;
    }

    // 4. TNT 炸藥桶引爆 (彩虹星芒與盤面烙印反饋)
    if (event.type === 'EXPLOSION') {
      this.triggerTntExplosion(peg, orb);
      return;
    }

    // 5. Boss 能量護盾核心釘 (SHIELD_CORE)
    if (event.type === 'SHIELD_CORE') {
      peg.isDestroyed = true;
      this.particles.emitRainbowStarburst(event.x, event.y, 28);
      this.renderer.addGlowDecal(event.x, event.y, '#38bdf8', 22);

      const shieldRes = this.dungeon.currentMonster.damageShield(1);
      if (shieldRes.isBroken) {
        this.soundEngine.playShieldBreak();
        this.renderer.triggerShake(18);
        this.combatText.spawn('★ BOSS SHIELD SHATTERED! ★', 360, 480, '#38bdf8', 28, true);
        this.saveData.bossShieldsBroken = (this.saveData.bossShieldsBroken || 0) + 1;
        StorageManager.save(this.saveData);
      } else {
        this.soundEngine.playShieldBreak();
        this.renderer.triggerShake(8);
        this.combatText.spawn(`SHIELD -1 (${shieldRes.remaining} REMAINING)`, event.x, event.y - 20, '#38bdf8', 19, true);
      }
      this.turnScore += 100;
      return;
    }

    // 6. Boss 召喚的小怪干擾釘 (MINION)
    if (event.type === 'MINION') {
      peg.minionHp -= 1;
      this.soundEngine.playMonsterHit();
      if (peg.minionHp <= 0) {
        peg.isDestroyed = true;
        this.particles.emitRainbowStarburst(event.x, event.y, 24);
        this.renderer.addGlowDecal(event.x, event.y, '#e11d48', 18);
        this.combatText.spawn('💀 MINION SLAIN! +60', event.x, event.y - 15, '#f43f5e', 18, true);
        this.turnScore += 60;
      } else {
        this.particles.emitSparks(event.x, event.y, '#fb7185', 8);
        this.combatText.spawn('MINION -1 HP', event.x, event.y - 12, '#fda4af', 15);
      }
      return;
    }

    // 7. 一般釘子 / 弱點釘碰撞
    if (!peg.isHitThisTurn) {
      peg.isHitThisTurn = true;
      this.comboHits++;

      if (this.comboHits > (this.saveData.highestCombo || 0)) {
        this.saveData.highestCombo = this.comboHits;
      }

      // 吸血尖牙遺物
      if (this.relicManager.hasRelic('vampire-fang')) {
        this.vampireHitCounter++;
        if (this.vampireHitCounter >= 15) {
          this.vampireHitCounter = 0;
          this.dungeon.manaOrbs = Math.min(this.dungeon.maxManaOrbs + 3, this.dungeon.manaOrbs + 1);
          this.combatText.spawn('🧛 +1 MANA (VAMPIRE!)', 120, 50, '#f43f5e', 18, true);
          this.particles.emitCritStars(120, 50, 10);
        }
      }

      // 靈魂汲取遺物
      if (this.relicManager.hasRelic('soul-siphon') && this.comboHits % 8 === 0) {
        this.dungeon.playerHp = Math.min(this.dungeon.maxPlayerHp, this.dungeon.playerHp + 1);
        this.combatText.spawn('+1 HP', 80, 50, '#4ade80', 16, true);
      }

      // 分裂核心遺物
      if (this.relicManager.hasRelic('split-core') && this.comboHits === 10) {
        const subOrb = new Orb(orb.x, orb.y, -orb.vx * 0.8, orb.vy * 0.8, orb.orbType, true);
        this.orbs.push(subOrb);
        this.combatText.spawn('SPLIT!', orb.x, orb.y - 15, '#00f3ff', 18, true);
      }

      // 計算基礎傷害
      const isWeakpoint = peg.type === 'WEAKPOINT';
      let baseDmg = isWeakpoint ? 45 : 15;

      // 寒霜晶球專屬易傷機制 (Frost Orb):
      // 若釘子原本已處於冰凍狀態，下一次撞擊傷害 250%！
      let isFrostShatter = false;
      if (peg.isFrostbitten) {
        baseDmg = Math.floor(baseDmg * 2.5);
        isFrostShatter = true;
        this.soundEngine.playFrostShatter();
        this.particles.emitFrostShatter(peg.x, peg.y, 22);
        this.combatText.spawn('❄️ FROST SHATTER! 2.5X', peg.x, peg.y - 25, '#38bdf8', 20, true);
      } else if (orb.orbType === 'FROST') {
        peg.applyFrost();
        this.particles.emitFrostShatter(peg.x, peg.y, 10);
      }

      // 混沌雷球專屬機制 (Lightning Orb):
      // 每次彈跳在空中隨機跳躍電弧穿透 2 顆遠處釘子
      if (orb.orbType === 'LIGHTNING') {
        this.triggerLightningArcs(peg);
      }

      // 虛空黑球專屬機制 (Void Orb):
      // 引力壓縮傷害額外 +30%
      if (orb.orbType === 'VOID') {
        baseDmg = Math.floor(baseDmg * 1.3);
        this.soundEngine.playVoidWarp();
      }

      // 過載電池加成
      let isOverchargedHit = false;
      if (orb.isOvercharged) {
        baseDmg *= 2;
        orb.isOvercharged = false;
        isOverchargedHit = true;
      }

      this.turnScore += baseDmg;
      this.soundEngine.playPegChime(this.comboHits, isWeakpoint);

      if (isOverchargedHit) {
        this.renderer.triggerShake(7);
        this.particles.emitOverchargeElectrics(event.x, event.y);
        this.combatText.spawnMagicDamage(baseDmg, event.x, event.y - 15);
      } else if (isWeakpoint) {
        this.renderer.triggerShake(6);
        this.gameLoop.triggerHitstop(35);
        this.particles.emitCritStars(event.x, event.y, 16);
        this.combatText.spawnCritDamage(baseDmg, event.x, event.y - 15);

        if (this.relicManager.hasRelic('chain-zap')) {
          this.triggerChainZap(peg);
        }
      } else if (!isFrostShatter) {
        this.particles.emitSparks(event.x, event.y, '#00f3ff', 8);
        this.combatText.spawnNormalDamage(baseDmg, event.x, event.y - 10);
      }
    }
  }

  // 混沌雷球跳躍電弧穿透 2 顆遠處釘子
  private triggerLightningArcs(originPeg: Peg): void {
    let count = 0;
    for (const p of this.pegs) {
      if (count >= 2) break;
      if (!p.isHitThisTurn && !p.isDestroyed && p.id !== originPeg.id) {
        const dx = p.x - originPeg.x;
        const dy = p.y - originPeg.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 50 && dist < 260) {
          p.isHitThisTurn = true;
          p.triggerHitFlash();
          this.comboHits++;
          this.turnScore += 22;

          this.soundEngine.playLightningArc();
          this.particles.emitLightningArcParticles(originPeg.x, originPeg.y, p.x, p.y, 14);
          this.combatText.spawn('⚡ ARC +22', p.x, p.y - 15, '#facc15', 16);
          count++;
        }
      }
    }
  }

  // 隕石衝擊波觸發
  private triggerMeteorStrike(portalX: number, portalY: number): void {
    this.soundEngine.playMeteorShockwave();
    this.renderer.triggerShake(16);
    this.gameLoop.triggerHitstop(45);
    this.particles.emitMeteorShockwave(portalX, portalY);
    this.combatText.spawn('☄️ METEOR SHOCKWAVE!', portalX, portalY - 24, '#f97316', 24, true);

    const blastRadius = 140;
    for (const p of this.pegs) {
      if (p.isDestroyed) continue;
      const dx = p.x - portalX;
      const dy = p.y - portalY;
      if (dx * dx + dy * dy <= blastRadius * blastRadius) {
        if (p.type === 'TNT') {
          this.triggerTntExplosion(p);
        } else if (p.type === 'SHIELD_CORE') {
          p.isDestroyed = true;
          this.dungeon.currentMonster.damageShield(1);
        } else {
          p.isHitThisTurn = true;
          p.triggerHitFlash();
          this.comboHits++;
          this.turnScore += 25;
          this.particles.emitSparks(p.x, p.y, '#f97316', 6);
        }
      }
    }
  }

  private triggerTntExplosion(tntPeg: Peg, triggerOrb?: Orb): void {
    tntPeg.isDestroyed = true;
    this.soundEngine.playExplosion();
    this.renderer.triggerShake(12);
    this.gameLoop.triggerHitstop(60);
    this.particles.emitExplosion(tntPeg.x, tntPeg.y, 35);
    this.particles.emitRainbowStarburst(tntPeg.x, tntPeg.y, 26);
    this.renderer.addGlowDecal(tntPeg.x, tntPeg.y, '#ff4400', 25);
    this.combatText.spawn('BOOM! +150', tntPeg.x, tntPeg.y - 20, '#ff4400', 24, true);

    const hasResonance = this.relicManager.hasRelic('blast-resonance');
    const blastRadius = hasResonance ? 120 : ORB_PHYSICS.TNT_BLAST_RADIUS;
    const blastDmg = hasResonance ? 240 : 150;
    this.turnScore += blastDmg;

    if (this.relicManager.hasRelic('prism-splinter')) {
      const splinter1 = new Orb(tntPeg.x, tntPeg.y - 10, -520, -420, this.equippedOrb, false, true);
      const splinter2 = new Orb(tntPeg.x, tntPeg.y - 10, 520, -420, this.equippedOrb, false, true);
      this.orbs.push(splinter1, splinter2);
      this.combatText.spawn('💎 PRISM SPLINTER x2!', tntPeg.x, tntPeg.y - 45, '#06b6d4', 20, true);
    }

    if (triggerOrb) {
      const dx = triggerOrb.x - tntPeg.x;
      const dy = triggerOrb.y - tntPeg.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      triggerOrb.vx += (dx / dist) * 460;
      triggerOrb.vy -= 360;
    }

    for (const p of this.pegs) {
      if (p.isDestroyed || p.id === tntPeg.id) continue;
      const dx = p.x - tntPeg.x;
      const dy = p.y - tntPeg.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= blastRadius * blastRadius) {
        if (p.type === 'TNT') {
          window.setTimeout(() => {
            if (!p.isDestroyed) this.triggerTntExplosion(p);
          }, 80);
        } else if (p.type === 'SHIELD_CORE') {
          p.isDestroyed = true;
          this.dungeon.currentMonster.damageShield(1);
        } else {
          p.isHitThisTurn = true;
          p.triggerHitFlash();
          this.comboHits++;
          this.turnScore += 20;
          this.particles.emitSparks(p.x, p.y, '#ff8800', 6);
        }
      }
    }
  }

  private triggerChainZap(centerPeg: Peg): void {
    let zapped = 0;
    for (const p of this.pegs) {
      if (zapped >= 3) break;
      if (!p.isHitThisTurn && !p.isDestroyed && p.id !== centerPeg.id) {
        const dx = p.x - centerPeg.x;
        const dy = p.y - centerPeg.y;
        if (dx * dx + dy * dy < 180 * 180) {
          p.isHitThisTurn = true;
          p.triggerHitFlash();
          this.comboHits++;
          this.turnScore += 25;
          this.particles.emitSparks(p.x, p.y, '#ffd700', 8);
          this.combatText.spawnMagicDamage(25, p.x, p.y - 12);
          zapped++;
        }
      }
    }
  }

  // 底部動態集球槽位接球 (Dynamic Bucket Jackpot)
  private handleBucketCatch(orb: Orb, reward?: { type: string; label: string }): void {
    const rewardType = reward?.type || 'FREE_BALL';

    // 激發金色禮花
    this.particles.emitJackpotFireworks(orb.x, orb.y, 48);

    if (rewardType === 'SCORE_5X') {
      this.soundEngine.playJackpotWin();
      this.renderer.triggerShake(10);
      this.turnScore += 1500;
      this.turnScore = Math.floor(this.turnScore * 1.5);
      this.combatText.spawn('★ 5X SCORE JACKPOT! +1500 ★', 360, 1140, '#facc15', 26, true);
    } else if (rewardType === 'MANA_3X') {
      this.soundEngine.playJackpotWin();
      this.renderer.triggerShake(8);
      this.dungeon.manaOrbs = Math.min(this.dungeon.maxManaOrbs + 4, this.dungeon.manaOrbs + 3);
      this.turnScore += 600;
      this.combatText.spawn('★ 3X MANA JACKPOT! +3 ORBS ★', 360, 1140, '#38bdf8', 24, true);
    } else {
      this.soundEngine.playBucketCatch();
      this.turnScore += 500;
      this.combatText.spawn('★ FREE BALL! +500 ★', 360, 1140, '#10b981', 22, true);
    }

    // 點金魔手遺物：集球桶捕獲時傷害乘區額外 +30%
    if (this.relicManager.hasRelic('midas-touch')) {
      this.turnScore = Math.floor(this.turnScore * 1.3);
      this.combatText.spawn('MIDAS +30%!', 360, 1110, '#facc15', 20, true);
    }
  }

  private resolveTurn(): void {
    let mult = 1.0;
    for (const step of COMBO_LADDER) {
      if (this.comboHits >= step.minHits && this.comboHits <= step.maxHits) {
        mult = step.multiplier;
        break;
      }
    }

    if (this.relicManager.hasRelic('tuning-fork')) {
      mult = Math.min(5.0, mult * 1.4);
    }

    if (this.relicManager.hasRelic('frost-nova') && this.comboHits >= 20) {
      this.dungeon.currentMonster.data.currentCountdown++;
      this.combatText.spawn('❄️ FROZEN! +1 TURN', 650, 70, '#38bdf8', 18, true);
    }

    const rawDamage = Math.floor(this.turnScore * mult * this.dungeon.scoreMultiplier);
    this.dungeon.score += rawDamage;

    // 扣除怪物 HP (含 Boss 狂暴觸發演出)
    const { actualDmg, isShieldDeflected, justEnraged } = this.dungeon.currentMonster.takeDamage(rawDamage);
    this.soundEngine.playMonsterHit();

    if (justEnraged) {
      this.soundEngine.playBossRoar();
      this.renderer.triggerShake(22);
      this.particles.emitBossRoarShockwave(360, 240);
      this.combatText.spawn('⚠️ BOSS ENRAGED! 狂暴狀態! ⚠️', 360, 260, '#ff0033', 30, true);
    }

    if (isShieldDeflected) {
      this.combatText.spawn(`🛡️ DEFLECTED! -${actualDmg}`, 640, 42, '#38bdf8', 22, true);
    } else {
      this.combatText.spawnCritDamage(actualDmg, 650, 40);
    }

    // 檢查本次回合是否主力彈珠均落溝死區 (集球桶接住則保留)
    const isFreeBall = this.orbs.some((o) => !o.isMiniBullet && this.bucket.containsOrb(o.x, o.y, o.radius));
    if (!isFreeBall) {
      this.dungeon.manaOrbs = Math.max(0, this.dungeon.manaOrbs - 1);
    }

    if (!this.dungeon.currentMonster.isAlive()) {
      this.handleMonsterKilled();
    } else {
      const attackInfo = this.dungeon.currentMonster.advanceTurn();

      if (attackInfo.shouldSpawnMinion) {
        const minions = PegboardGenerator.spawnMinions(this.pegs, 2);
        if (minions.length > 0) {
          this.soundEngine.playMinionSpawn();
          for (const m of minions) {
            this.particles.emitMinionSpawn(m.x, m.y);
          }
          this.combatText.spawn('⚠️ MINIONS SUMMONED!', 360, 320, '#e11d48', 22, true);
        }
      }

      if (attackInfo.shouldAttack) {
        this.dungeon.playerHp = Math.max(0, this.dungeon.playerHp - attackInfo.damage);
        this.soundEngine.playPlayerHit();
        this.renderer.triggerShake(14);
        this.combatText.spawn(`MONSTER ATTACK! -${attackInfo.damage}`, 100, 40, '#ef4444', 22, true);
      }

      if (this.dungeon.playerHp <= 0 || (this.dungeon.manaOrbs <= 0 && this.dungeon.currentMonster.isAlive())) {
        this.handleGameOver();
      } else {
        this.state = 'BATTLE_AIM';
      }
    }
  }

  private handleMonsterKilled(): void {
    this.particles.emitCritStars(360, 600, 40);
    this.combatText.spawn('VICTORY!', 360, 500, '#ffd700', 36, true);

    if (this.dungeon.isFinalFloorCleared()) {
      this.handleVictory();
    } else {
      this.draftRelics = this.relicManager.rollDraft(3);
      this.state = 'RELIC_DRAFT';
    }
  }

  private chooseRelic(relic: Relic): void {
    this.relicManager.addRelic(relic);
    this.combatText.spawn(`OBTAINED ${relic.name}!`, 360, 600, relic.iconColor, 24, true);

    // 進入下一層秘境
    this.dungeon.advanceFloor();
    const extraShield = this.selectedGameMode === 'ENDLESS' && this.activeModifiers.some((m) => m.id === 'HARDENED_PEGS');
    this.pegs = PegboardGenerator.generate(this.dungeon.currentFloor, extraShield);
    this.state = 'BATTLE_AIM';
  }

  private async handleGameOver(): Promise<void> {
    this.state = 'GAME_OVER';
    await PlayroomService.finishRun(this.currentRunId, this.dungeon.score);

    if (this.selectedGameMode === 'ENDLESS') {
      if (this.dungeon.score > (this.saveData.endlessHighScore || 0)) {
        this.saveData.endlessHighScore = this.dungeon.score;
      }
      if (this.dungeon.currentFloor > (this.saveData.endlessHighestFloor || 1)) {
        this.saveData.endlessHighestFloor = this.dungeon.currentFloor;
      }
    } else {
      if (this.dungeon.score > this.saveData.highScore) {
        this.saveData.highScore = this.dungeon.score;
      }
      if (this.dungeon.currentFloor > this.saveData.highestFloor) {
        this.saveData.highestFloor = this.dungeon.currentFloor;
      }
    }
    StorageManager.save(this.saveData);
  }

  private async handleVictory(): Promise<void> {
    this.state = 'VICTORY';
    this.dungeon.score += 10000;
    await PlayroomService.finishRun(this.currentRunId, this.dungeon.score);

    if (this.dungeon.score > this.saveData.highScore) {
      this.saveData.highScore = this.dungeon.score;
    }
    this.saveData.highestFloor = 10;
    StorageManager.save(this.saveData);
  }

  private updateAimTrajectory(): void {
    const startX = ORB_PHYSICS.CANNON_X;
    const startY = ORB_PHYSICS.CANNON_Y;
    const angle = this.inputManager.aimAngleRad;
    const speed = ORB_PHYSICS.LAUNCH_SPEED;

    this.trajectoryPoints = [{ x: startX, y: startY, isBounce: false }];

    let posX = startX;
    let posY = startY;
    let velX = Math.cos(angle) * speed;
    let velY = Math.sin(angle) * speed;

    const dt = 1 / 90;
    let bounces = 0;

    for (let step = 0; step < ORB_PHYSICS.TRAJECTORY_MAX_STEPS && bounces < ORB_PHYSICS.TRAJECTORY_MAX_BOUNCES; step++) {
      velY += ORB_PHYSICS.GRAVITY_Y * dt;
      const drag = Math.pow(ORB_PHYSICS.AIR_DRAG, dt * 60);
      velX *= drag;
      velY *= drag;

      posX += velX * dt;
      posY += velY * dt;

      let collided = false;

      if (posX <= ORB_PHYSICS.WALL_LEFT + ORB_PHYSICS.ORB_RADIUS) {
        posX = ORB_PHYSICS.WALL_LEFT + ORB_PHYSICS.ORB_RADIUS;
        velX = -velX * 0.85;
        collided = true;
      } else if (posX >= ORB_PHYSICS.WALL_RIGHT - ORB_PHYSICS.ORB_RADIUS) {
        posX = ORB_PHYSICS.WALL_RIGHT - ORB_PHYSICS.ORB_RADIUS;
        velX = -velX * 0.85;
        collided = true;
      }

      if (posY <= ORB_PHYSICS.CEILING_TOP + ORB_PHYSICS.ORB_RADIUS) {
        posY = ORB_PHYSICS.CEILING_TOP + ORB_PHYSICS.ORB_RADIUS;
        velY = -velY * 0.85;
        collided = true;
      }

      if (!collided) {
        for (let i = 0; i < this.pegs.length; i++) {
          const peg = this.pegs[i];
          if (peg.isDestroyed) continue;
          const dx = posX - peg.x;
          const dy = posY - peg.y;
          const distSq = dx * dx + dy * dy;
          const minDist = ORB_PHYSICS.ORB_RADIUS + peg.radius;

          if (distSq <= minDist * minDist) {
            const dist = Math.sqrt(distSq) || 0.001;
            const nx = dx / dist;
            const ny = dy / dist;
            const vn = velX * nx + velY * ny;

            if (vn < 0) {
              const J = -(1 + ORB_PHYSICS.PEG_RESTITUTION) * vn;
              velX += J * nx;
              velY += J * ny;
              collided = true;
              break;
            }
          }
        }
      }

      if (collided) {
        bounces++;
        this.trajectoryPoints.push({ x: posX, y: posY, isBounce: true });
      } else if (step % 4 === 0) {
        this.trajectoryPoints.push({ x: posX, y: posY, isBounce: false });
      }

      if (posY > ORB_PHYSICS.FLOOR_DEAD_ZONE) break;
    }
  }

  private render = (_alpha: number): void => {
    this.renderer.render(
      this.state,
      this.pegs,
      this.orbs,
      this.bucket,
      this.dungeon.currentMonster,
      this.comboHits,
      this.turnScore,
      this.dungeon.score,
      this.dungeon.currentFloor,
      this.dungeon.playerHp,
      this.dungeon.manaOrbs,
      this.relicManager.getActiveRelics(),
      this.trajectoryPoints,
      this.inputManager.isAiming,
      this.inputManager.aimAngleRad,
      this.particles,
      this.combatText,
      this.saveData,
      this.draftRelics,
      this.equippedOrb,
      this.unlockedOrbs,
      this.selectedGameMode,
      this.activeModifiers
    );
  };
}
