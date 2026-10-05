import { OrbCascadeSave } from '../types';

export class StorageManager {
  private static readonly KEY = 'orb-cascade:save:v1';

  public static load(): OrbCascadeSave {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.highScore === 'number') {
          return {
            version: 1,
            highScore: Math.floor(parsed.highScore) || 0,
            highestFloor: Math.floor(parsed.highestFloor) || 1,
            totalRuns: Math.floor(parsed.totalRuns) || 0,
            totalKills: Math.floor(parsed.totalKills) || 0,
            isMuted: Boolean(parsed.isMuted),
          };
        }
      }
    } catch (e) {
      console.warn('[StorageManager] Failed to read save data, fallback to default.', e);
    }

    return {
      version: 1,
      highScore: 0,
      highestFloor: 1,
      totalRuns: 0,
      totalKills: 0,
      isMuted: false,
    };
  }

  public static save(data: OrbCascadeSave): void {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[StorageManager] Failed to write save data.', e);
    }
  }
}
