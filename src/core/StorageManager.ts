import { OrbCascadeSave } from '../types';

export class StorageManager {
  private static readonly KEY_V2 = 'orb-cascade:save:v2';
  private static readonly KEY_V1 = 'orb-cascade:save:v1';

  public static load(): OrbCascadeSave {
    // 1. 嘗試讀取 v2 存檔
    try {
      const rawV2 = localStorage.getItem(this.KEY_V2);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        if (parsed && typeof parsed.highScore === 'number') {
          return {
            version: 2,
            highScore: Math.floor(parsed.highScore) || 0,
            highestFloor: Math.floor(parsed.highestFloor) || 1,
            totalRuns: Math.floor(parsed.totalRuns) || 0,
            totalKills: Math.floor(parsed.totalKills) || 0,
            isMuted: Boolean(parsed.isMuted),
            highestCombo: Math.floor(parsed.highestCombo) || 0,
            bossShieldsBroken: Math.floor(parsed.bossShieldsBroken) || 0,
          };
        }
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading v2 save, checking legacy.', e);
    }

    // 2. 平滑遷移：若 v2 不存在，檢查並遷移 v1 舊存檔
    try {
      const rawV1 = localStorage.getItem(this.KEY_V1);
      if (rawV1) {
        const legacy = JSON.parse(rawV1);
        if (legacy && typeof legacy.highScore === 'number') {
          const migrated: OrbCascadeSave = {
            version: 2,
            highScore: Math.floor(legacy.highScore) || 0,
            highestFloor: Math.floor(legacy.highestFloor) || 1,
            totalRuns: Math.floor(legacy.totalRuns) || 0,
            totalKills: Math.floor(legacy.totalKills) || 0,
            isMuted: Boolean(legacy.isMuted),
            highestCombo: 0,
            bossShieldsBroken: 0,
          };
          this.save(migrated);
          console.info('[StorageManager] Successfully migrated v1 save to v2.');
          return migrated;
        }
      }
    } catch (e) {
      console.warn('[StorageManager] Error reading legacy v1 save.', e);
    }

    // 3. 預設初始存檔
    return {
      version: 2,
      highScore: 0,
      highestFloor: 1,
      totalRuns: 0,
      totalKills: 0,
      isMuted: false,
      highestCombo: 0,
      bossShieldsBroken: 0,
    };
  }

  public static save(data: OrbCascadeSave): void {
    try {
      localStorage.setItem(this.KEY_V2, JSON.stringify(data));
    } catch (e) {
      console.warn('[StorageManager] Failed to write save data.', e);
    }
  }
}
