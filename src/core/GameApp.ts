import { ORB_PHYSICS, COMBO_LADDER } from './Constants';
import { GameState, Relic, TrajectoryPoint, OrbCascadeSave } from '../types';
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
  private pegs: Peg[] = [];
  private orbs: Orb[] = [];
  private bucket: Bucket = new Bucket();
  private dungeon: DungeonProgress = new DungeonProgress();
  private relicManager: RelicManager = new RelicManager();

  private soundEngine: SoundEngine;
  private music: ProceduralMusic;
  private renderer: CanvasRenderer;
  private particles: ParticleSystem = new ParticleSystem();
  private combatText: FloatingCombatText = new FloatingCombatText();
  private inputManager: InputManager;
  private gameLoop: GameLoop;
  private saveData: OrbCascadeSave;

  // 當前回合戰鬥狀態數據
  private comboHits = 0;
  private turnScore = 0;
  private currentRunId: string | null = null;
  private draftRelics: Relic[] = [];
  private trajectoryPoints: TrajectoryPoint[] = [];

  // 延遲發射雙重魔彈定時器
  private twinOrbLaunchTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.soundEngine = new SoundEngine();
    this.music = new ProceduralMusic(this.soundEngine);
    this.renderer = new CanvasRenderer(canvas);
    this.saveData = StorageManager.load();

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
    // 處理點擊與介面按鈕交互
    this.handleInputClicks();

    // 更新音效與粒子、飄字系統
    this.particles.update(dt);
    this.combatText.update(dt);
    this.renderer.update(dt);

    for (const peg of this.pegs) {
      peg.update(dt);
    }

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

      // 檢查右上角靜音按鈕: [652, 92, 44, 30]
      if (x >= 645 && x <= 700 && y >= 85 && y <= 130) {
        this.toggleMute();
      }

      if (this.state === 'TITLE') {
        // START RUN 按鈕: [180, 580, 360, 68]
        if (x >= 180 && x <= 540 && y >= 580 && y <= 648) {
          this.startNewRun();
        }
      } else if (this.state === 'RELIC_DRAFT') {
        // 三選一卡牌按鈕: y 從 360 開始，間隔 160，高 135
        for (let i = 0; i < this.draftRelics.length; i++) {
          const cardY = 360 + i * 160;
          if (x >= 90 && x <= 630 && y >= cardY && y <= cardY + 135) {
            this.chooseRelic(this.draftRelics[i]);
            break;
          }
        }
      } else if (this.state === 'GAME_OVER') {
        // RETRY 按鈕: [200, 650, 320, 64]
        if (x >= 200 && x <= 520 && y >= 650 && y <= 714) {
          this.startNewRun();
        }
      } else if (this.state === 'VICTORY') {
        // RETURN 按鈕: [200, 640, 320, 64]
        if (x >= 200 && x <= 520 && y >= 640 && y <= 704) {
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
    this.dungeon.resetRun();
    this.relicManager.reset();
    this.bucket.reset();
    this.pegs = PegboardGenerator.generate(1);
    this.orbs = [];
    this.comboHits = 0;
    this.turnScore = 0;

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

    // 建立主力彈珠
    const mainOrb = new Orb(ORB_PHYSICS.CANNON_X, ORB_PHYSICS.CANNON_Y, vx, vy);
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
        const secondOrb = new Orb(ORB_PHYSICS.CANNON_X, ORB_PHYSICS.CANNON_Y, vx, vy, true);
        this.orbs.push(secondOrb);
        this.soundEngine.playShoot();
      }
    }

    const restitutionMult = this.relicManager.hasRelic('super-gum') ? 1.13 : 1.0;

    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.update(dt, this.pegs, restitutionMult, (event) => this.handleCollision(event, orb));

      // 集球桶接球檢測 (Free Ball)
      if (!orb.isDead && this.bucket.containsOrb(orb.x, orb.y, orb.radius)) {
        orb.isDead = true;
        this.handleBucketCatch(orb);
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
      this.combatText.spawn('BOUNCE!', event.x, event.y - 15, '#e040fb', 18, true);
      return;
    }

    // 2. 傳送門
    if (event.type === 'PORTAL') {
      this.soundEngine.playPortal();
      this.particles.emitPortalVortex(event.x, event.y);
      return;
    }

    // 3. 重置金釘
    if (event.type === 'RESET') {
      this.soundEngine.playReset();
      this.renderer.triggerShake(6);
      this.particles.emitCritStars(event.x, event.y, 20);
      this.combatText.spawn('★ RESET ALL! ★', event.x, event.y - 20, '#facc15', 22, true);

      // 全場已擊中的釘子光芒重現
      for (const p of this.pegs) {
        if (!p.isDestroyed) {
          p.isHitThisTurn = false;
          p.triggerHitFlash();
        }
      }
      return;
    }

    // 4. TNT 炸藥桶引爆
    if (event.type === 'EXPLOSION') {
      this.triggerTntExplosion(peg, orb);
      return;
    }

    // 5. 一般釘子 / 弱點釘碰撞
    if (!peg.isHitThisTurn) {
      peg.isHitThisTurn = true;
      this.comboHits++;

      // 靈魂汲取遺物：每 8 次碰撞回血 1 點
      if (this.relicManager.hasRelic('soul-siphon') && this.comboHits % 8 === 0) {
        this.dungeon.playerHp = Math.min(this.dungeon.maxPlayerHp, this.dungeon.playerHp + 1);
        this.combatText.spawn('+1 HP', 80, 50, '#4ade80', 16, true);
      }

      // 分裂核心遺物：撞擊 10 次分裂一顆子球
      if (this.relicManager.hasRelic('split-core') && this.comboHits === 10) {
        const subOrb = new Orb(orb.x, orb.y, -orb.vx * 0.8, orb.vy * 0.8, true);
        this.orbs.push(subOrb);
        this.combatText.spawn('SPLIT!', orb.x, orb.y - 15, '#00f3ff', 18, true);
      }

      // 計算基礎傷害與音效
      const isWeakpoint = peg.type === 'WEAKPOINT';
      const baseDmg = isWeakpoint ? 45 : 15;
      this.turnScore += baseDmg;

      this.soundEngine.playPegChime(this.comboHits, isWeakpoint);

      if (isWeakpoint) {
        this.renderer.triggerShake(6);
        this.gameLoop.triggerHitstop(35);
        this.particles.emitCritStars(event.x, event.y, 16);
        this.combatText.spawn('CRIT! +45', event.x, event.y - 15, '#ffd700', 20, true);

        // 雷霆連鎖遺物：擊中弱點引爆鄰近 3 顆釘子
        if (this.relicManager.hasRelic('chain-zap')) {
          this.triggerChainZap(peg);
        }
      } else {
        this.particles.emitSparks(event.x, event.y, '#00f3ff', 8);
        this.combatText.spawn('+15', event.x, event.y - 10, '#38bdf8', 14);
      }
    }
  }

  private triggerTntExplosion(tntPeg: Peg, triggerOrb?: Orb): void {
    tntPeg.isDestroyed = true;
    this.soundEngine.playExplosion();
    this.renderer.triggerShake(12);
    this.gameLoop.triggerHitstop(60);
    this.particles.emitExplosion(tntPeg.x, tntPeg.y, 35);
    this.combatText.spawn('BOOM! +150', tntPeg.x, tntPeg.y - 20, '#ff4400', 24, true);

    const hasResonance = this.relicManager.hasRelic('blast-resonance');
    const blastRadius = hasResonance ? 120 : ORB_PHYSICS.TNT_BLAST_RADIUS;
    const blastDmg = hasResonance ? 240 : 150;
    this.turnScore += blastDmg;

    // 給予彈珠衝量
    if (triggerOrb) {
      const dx = triggerOrb.x - tntPeg.x;
      const dy = triggerOrb.y - tntPeg.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      triggerOrb.vx += (dx / dist) * 450;
      triggerOrb.vy -= 350;
    }

    // 廣度優先範圍引爆檢測
    for (const p of this.pegs) {
      if (p.isDestroyed || p.id === tntPeg.id) continue;
      const dx = p.x - tntPeg.x;
      const dy = p.y - tntPeg.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= blastRadius * blastRadius) {
        if (p.type === 'TNT') {
          // 連鎖引爆
          window.setTimeout(() => {
            if (!p.isDestroyed) this.triggerTntExplosion(p);
          }, 80);
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
          this.combatText.spawn('⚡ ZAP', p.x, p.y - 12, '#ffd700', 16, true);
          zapped++;
        }
      }
    }
  }

  private handleBucketCatch(orb: Orb): void {
    this.soundEngine.playBucketCatch();
    this.particles.emitCritStars(orb.x, orb.y, 22);
    this.combatText.spawn('★ FREE BALL! +500 ★', 360, 1150, '#10b981', 22, true);

    // 增加分數
    this.turnScore += 500;

    // 點金魔手遺物：集球桶捕獲時傷害乘區 +30%
    if (this.relicManager.hasRelic('midas-touch')) {
      this.turnScore = Math.floor(this.turnScore * 1.3);
      this.combatText.spawn('MIDAS +30%!', 360, 1120, '#facc15', 20, true);
    }
  }

  private resolveTurn(): void {
    // 檢查是否有彈珠被集球桶捕獲過（若落溝且未被集球桶接住，才扣除 1 顆彈珠）
    // 計算 Combo 傷害倍率
    let mult = 1.0;
    for (const step of COMBO_LADDER) {
      if (this.comboHits >= step.minHits && this.comboHits <= step.maxHits) {
        mult = step.multiplier;
        break;
      }
    }

    // 共鳴音叉遺物：倍率增長速度提升 40%
    if (this.relicManager.hasRelic('tuning-fork')) {
      mult = Math.min(5.0, mult * 1.4);
    }

    // 霜凍新星遺物：Combo >= 20 怪物攻擊倒數 +1
    if (this.relicManager.hasRelic('frost-nova') && this.comboHits >= 20) {
      this.dungeon.currentMonster.data.currentCountdown++;
      this.combatText.spawn('❄️ FROZEN! +1 TURN', 650, 70, '#38bdf8', 18, true);
    }

    const finalDamage = Math.floor(this.turnScore * mult);
    this.dungeon.score += finalDamage;

    // 扣除怪物 HP
    const actualDmg = this.dungeon.currentMonster.takeDamage(finalDamage);
    this.soundEngine.playMonsterHit();
    this.combatText.spawn(`-${actualDmg}`, 650, 40, '#f43f5e', 24, true);

    // 檢查本次回合是否所有主力彈珠均落溝死區（若非被集球桶接住，則扣除 1 顆彈珠）
    const isFreeBall = this.orbs.some((o) => this.bucket.containsOrb(o.x, o.y, o.radius));
    if (!isFreeBall) {
      this.dungeon.manaOrbs = Math.max(0, this.dungeon.manaOrbs - 1);
    }

    // 判斷怪物生死
    if (!this.dungeon.currentMonster.isAlive()) {
      // 擊殺怪物！
      this.handleMonsterKilled();
    } else {
      // 怪物存活，推進攻擊倒數
      const attackInfo = this.dungeon.currentMonster.advanceTurn();
      if (attackInfo.shouldAttack) {
        this.dungeon.playerHp = Math.max(0, this.dungeon.playerHp - attackInfo.damage);
        this.soundEngine.playPlayerHit();
        this.renderer.triggerShake(14);
        this.combatText.spawn(`MONSTER ATTACK! -${attackInfo.damage}`, 100, 40, '#ef4444', 22, true);
      }

      // 檢查玩家是否陣亡或彈珠耗盡
      if (this.dungeon.playerHp <= 0 || (this.dungeon.manaOrbs <= 0 && this.dungeon.currentMonster.isAlive())) {
        this.handleGameOver();
      } else {
        // 進入下一回合瞄準
        this.state = 'BATTLE_AIM';
      }
    }
  }

  private handleMonsterKilled(): void {
    this.particles.emitCritStars(360, 600, 40);
    this.combatText.spawn('VICTORY!', 360, 500, '#ffd700', 36, true);

    if (this.dungeon.isFinalFloorCleared()) {
      // 通關全部 10 層！
      this.handleVictory();
    } else {
      // 抽取 3 款肉鴿遺物
      this.draftRelics = this.relicManager.rollDraft(3);
      this.state = 'RELIC_DRAFT';
    }
  }

  private chooseRelic(relic: Relic): void {
    this.relicManager.addRelic(relic);
    this.combatText.spawn(`OBTAINED ${relic.name}!`, 360, 600, relic.iconColor, 24, true);

    // 進入下一層秘境
    this.dungeon.advanceFloor();
    this.pegs = PegboardGenerator.generate(this.dungeon.currentFloor);
    this.state = 'BATTLE_AIM';
  }

  private async handleGameOver(): Promise<void> {
    this.state = 'GAME_OVER';
    await PlayroomService.finishRun(this.currentRunId, this.dungeon.score);

    if (this.dungeon.score > this.saveData.highScore) {
      this.saveData.highScore = this.dungeon.score;
    }
    if (this.dungeon.currentFloor > this.saveData.highestFloor) {
      this.saveData.highestFloor = this.dungeon.currentFloor;
    }
    StorageManager.save(this.saveData);
  }

  private async handleVictory(): Promise<void> {
    this.state = 'VICTORY';
    // 通關額外獎勵 10000 分
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

      // 側壁反彈預測
      if (posX <= ORB_PHYSICS.WALL_LEFT + ORB_PHYSICS.ORB_RADIUS) {
        posX = ORB_PHYSICS.WALL_LEFT + ORB_PHYSICS.ORB_RADIUS;
        velX = -velX * 0.85;
        collided = true;
      } else if (posX >= ORB_PHYSICS.WALL_RIGHT - ORB_PHYSICS.ORB_RADIUS) {
        posX = ORB_PHYSICS.WALL_RIGHT - ORB_PHYSICS.ORB_RADIUS;
        velX = -velX * 0.85;
        collided = true;
      }

      // 天花板反彈預測
      if (posY <= ORB_PHYSICS.CEILING_TOP + ORB_PHYSICS.ORB_RADIUS) {
        posY = ORB_PHYSICS.CEILING_TOP + ORB_PHYSICS.ORB_RADIUS;
        velY = -velY * 0.85;
        collided = true;
      }

      // 釘子碰撞預測
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
      this.draftRelics
    );
  };
}
