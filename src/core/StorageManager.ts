import { OrbCascadeSave, OrbType } from '../types';

export class StorageManager {
  private static readonly KEY_V3 = 'orb-cascade:save:v3';
  private static readonly KEY_V2 = 'orb-cascade:save:v2';
  private static readonly KEY_V1 = 'orb-cascade:save:v1';

  public static load(): OrbCascadeSave {
    // 1. 嘗試讀取 v3 存檔
    try {
      const rawV3 = localStorage.getItem(this.KEY_V3);
      if (rawV3) {
        const parsed = JSON.parse(rawV3);
        if (parsed && typeof parsed.highScore === 'number') {
          return {
            version: 3,
            highScore: Math.floor(parsed.highScore) || 0,
            highestFloor: Math.floor(parsed.highestFloor) || 1,
            endlessHighScore: Math.floor(parsed.endlessHighScore) || 0,
            endlessHighestFloor: Math.floor(parsed.endlessHighestFloor) || 1,
            totalRuns: Math.floor(parsed.totalRuns) || 0,
            totalKills: Math.floor(parsed.totalKills) || 0,
            isMuted: Boolean(parsed.isMuted),
            highestCombo: Math.floor(parsed.highestCombo) || 0,
            bossShieldsBroken: Math.floor(parsed.bossShieldsBroken) || 0,
            unlockedOrbs: (parsed.unlockedOrbs && Array.isArray(parsed.unlockedOrbs) ? parsed.unlockedOrbs : ['STANDARD', 'FROST', 'LIGHTNING', 'VOID']) as OrbType[],
            equippedOrb: (parsed.equippedOrb || 'STANDARD') as OrbType,
          };
        }
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading v3 save, checking v2/v1.', e);
    }

    // 2. 遷移 v2 存檔
    try {
      const rawV2 = localStorage.getItem(this.KEY_V2);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (parsed && typeof parsed.highScore === 'number') {
          const migrated: OrbCascadeSave = {
            version: 3,
            highScore: Math.floor(parsed.highScore) || 0,
            highestFloor: Math.floor(parsed.highestFloor) || 1,
            endlessHighScore: 0,
            endlessHighestFloor: 1,
            totalRuns: Math.floor(parsed.totalRuns) || 0,
            totalKills: Math.floor(parsed.totalKills) || 0,
            isMuted: Boolean(parsed.isMuted),
            highestCombo: Math.floor(parsed.highestCombo) || 0,
            bossShieldsBroken: Math.floor(parsed.bossShieldsBroken) || 0,
            unlockedOrbs: ['STANDARD', 'FROST', 'LIGHTNING', 'VOID'],
            equippedOrb: 'STANDARD',
          };
          this.save(migrated);
          console.info('[StorageManager] Successfully migrated v2 save to v3.');
          return migrated;
        }
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading v2 save.', e);
    }

    // 3. 遷移 v1 舊存檔
    try {
      const rawV1 = localStorage.getItem(this.KEY_V1);
      if (rawV1) {
        const legacy = JSON.parse(rawV1);
        if (legacy && typeof legacy.highScore === 'number') {
          const migrated: OrbCascadeSave = {
            version: 3,
            highScore: Math.floor(legacy.highScore) || 0,
            highestFloor: Math.floor(legacy.highestFloor) || 1,
            endlessHighScore: 0,
            endlessHighestFloor: 1,
            totalRuns: Math.floor(legacy.totalRuns) || 0,
            totalKills: Math.floor(legacy.totalKills) || 0,
            isMuted: Boolean(legacy.isMuted),
            highestCombo: 0,
            bossShieldsBroken: 0,
            unlockedOrbs: ['STANDARD', 'FROST', 'LIGHTNING', 'VOID'],
            equippedOrb: 'STANDARD',
          };
          this.save(migrated);
          console.info('[StorageManager] Successfully migrated v1 save to v3.');
          return migrated;
        }
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading legacy v1 save.', e);
    }

    // 4. 預設初始存檔
    return {
      version: 3,
      highScore: 0,
      highestFloor: 1,
      endlessHighScore: 0,
      endlessHighestFloor: 1,
      totalRuns: 0,
      totalKills: 0,
      isMuted: false,
      highestCombo: 0,
      bossShieldsBroken: 0,
      unlockedOrbs: ['STANDARD', 'FROST', 'LIGHTNING', 'VOID'],
      equippedOrb: 'STANDARD',
    };
  }

  public static save(data: OrbCascadeSave): void {
    try {
      localStorage.setItem(this.KEY_V3, JSON.stringify(data));
    } catch (e) {
      console.warn('[StorageManager] Failed to write save data.', e);
    }
  }
}
