import { Playroom } from '../playroom-sdk.js';
import { PlayroomReadyState } from '../types';

export class PlayroomService {
  private static isAvailable = false;
  private static mode: string = 'standalone';

  public static async init(): Promise<void> {
    try {
      if (Playroom && typeof Playroom.ready === 'function') {
        const state: PlayroomReadyState = await Playroom.ready();
        this.isAvailable = state ? state.available : false;
        this.mode = state ? state.mode : 'standalone';
        console.log(`[PlayroomService] Ready, mode: ${this.mode}, available: ${this.isAvailable}`);
      }
    } catch (err) {
      console.warn('[PlayroomService] SDK ready check skipped or failed, fallback to standalone.', err);
      this.isAvailable = false;
      this.mode = 'standalone';
    }
  }

  public static async startRun(): Promise<string | null> {
    if (!Playroom || typeof Playroom.startRun !== 'function') return null;
    try {
      const res = await Playroom.startRun();
      return res && res.runId ? res.runId : null;
    } catch (err) {
      console.error('[PlayroomService] startRun failed:', err);
      return null;
    }
  }

  public static async finishRun(runId: string | null, score: number): Promise<boolean> {
    if (!Playroom || !runId || typeof Playroom.finishRun !== 'function') return false;
    try {
      const res = await Playroom.finishRun({ runId, score });
      return Boolean(res && res.saved);
    } catch (err) {
      console.error('[PlayroomService] finishRun failed:', err);
      return false;
    }
  }
}
