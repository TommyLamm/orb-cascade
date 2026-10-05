import { Peg } from '../entities/Peg';
import { ORB_PHYSICS, MONSTERS_CONFIG } from '../core/Constants';

export class PegboardGenerator {
  public static generate(floorLevel: number): Peg[] {
    const pegs: Peg[] = [];
    let idCounter = 1;

    const rowStart = 250;
    const rowEnd = 980;
    const rowSpacing = 42;
    const colSpacing = 46;

    let rowIndex = 0;
    for (let y = rowStart; y <= rowEnd; y += rowSpacing) {
      rowIndex++;
      const isOddRow = rowIndex % 2 === 1;
      const xOffset = isOddRow ? 65 : 65 + colSpacing / 2;

      for (let x = xOffset; x <= 655; x += colSpacing) {
        // 利用空間波函數掏空若干路徑形成有機引導通道
        const noise = Math.sin(x * 0.015) + Math.cos(y * 0.012);
        if (noise > 1.38) continue;

        pegs.push(new Peg(idCounter++, x, y, 'REGULAR'));
      }
    }

    // 分配特殊機關釘
    this.assignSpecialPegs(pegs, floorLevel);

    return pegs;
  }

  private static assignSpecialPegs(pegs: Peg[], floorLevel: number): void {
    const total = pegs.length;
    if (total === 0) return;

    const configIndex = Math.min(floorLevel - 1, MONSTERS_CONFIG.length - 1);
    const monsterCfg = MONSTERS_CONFIG[configIndex];

    // 洗牌索引
    const indices = Array.from({ length: total }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    let ptr = 0;

    // 0. Boss 能量護盾核心釘 (SHIELD_CORE)
    if (monsterCfg.hasShield && monsterCfg.shieldMax > 0) {
      // 挑選位於盤面中央戰略要地的釘子 (y: 450 ~ 750)
      const coreCandidates = pegs.filter((p) => p.y >= 450 && p.y <= 750 && p.x >= 150 && p.x <= 570);
      let placedShieldCores = 0;
      for (const p of coreCandidates) {
        if (placedShieldCores >= monsterCfg.shieldMax) break;
        p.type = 'SHIELD_CORE';
        p.radius = ORB_PHYSICS.SHIELD_CORE_RADIUS;
        placedShieldCores++;
      }
    }

    // 1. 金色重置釘 (Golden Reset): 1~2 顆
    const resetCount = floorLevel >= 6 ? 1 : 2;
    for (let i = 0; i < resetCount && ptr < total; i++) {
      const p = pegs[indices[ptr++]];
      if (p.type === 'REGULAR') {
        p.type = 'RESET';
      }
    }

    // 2. 弱點爆擊釘 (Weakpoint - Crit): 約 12%
    const weakpointCount = Math.floor(total * 0.12);
    for (let i = 0; i < weakpointCount && ptr < total; i++) {
      const p = pegs[indices[ptr++]];
      if (p.type === 'REGULAR') {
        p.type = 'WEAKPOINT';
      }
    }

    // 3. 炸藥桶 (TNT): 4~5 顆
    const tntCount = 5;
    for (let i = 0; i < tntCount && ptr < total; i++) {
      const p = pegs[indices[ptr++]];
      if (p.type === 'REGULAR') {
        p.type = 'TNT';
        p.radius = ORB_PHYSICS.TNT_RADIUS;
      }
    }

    // 4. 彈跳魔菇 (MUSHROOM): 3~4 顆，優先在中下盤面 (y > 550)
    let mushroomsPlaced = 0;
    for (let i = 0; i < total && mushroomsPlaced < 4; i++) {
      const p = pegs[i];
      if (p.type === 'REGULAR' && p.y > 550 && p.y < 900) {
        p.type = 'MUSHROOM';
        p.radius = ORB_PHYSICS.MUSHROOM_RADIUS;
        mushroomsPlaced++;
      }
    }

    // 5. 傳送門對 (Portal Pairs): 左右各 1 顆
    const leftCandidates = pegs.filter((p) => p.type === 'REGULAR' && p.x < 240 && p.y > 400 && p.y < 800);
    const rightCandidates = pegs.filter((p) => p.type === 'REGULAR' && p.x > 480 && p.y > 400 && p.y < 800);

    if (leftCandidates.length > 0 && rightCandidates.length > 0) {
      const portalA = leftCandidates[Math.floor(Math.random() * leftCandidates.length)];
      const portalB = rightCandidates[Math.floor(Math.random() * rightCandidates.length)];

      portalA.type = 'PORTAL';
      portalA.radius = ORB_PHYSICS.PORTAL_RADIUS;
      portalB.type = 'PORTAL';
      portalB.radius = ORB_PHYSICS.PORTAL_RADIUS;

      portalA.pairedPortalId = portalB.id;
      portalB.pairedPortalId = portalA.id;
    }
  }

  // Boss 召喚小怪干擾釘
  public static spawnMinions(pegs: Peg[], count = 2): Peg[] {
    const spawned: Peg[] = [];
    const regulars = pegs.filter((p) => p.type === 'REGULAR' && !p.isDestroyed && p.y >= 300 && p.y <= 850);
    for (let i = 0; i < count && regulars.length > 0; i++) {
      const idx = Math.floor(Math.random() * regulars.length);
      const chosen = regulars.splice(idx, 1)[0];
      chosen.type = 'MINION';
      chosen.radius = ORB_PHYSICS.MINION_PEG_RADIUS;
      chosen.minionHp = 2;
      chosen.isHitThisTurn = false;
      chosen.triggerHitFlash();
      spawned.push(chosen);
    }
    return spawned;
  }
}
