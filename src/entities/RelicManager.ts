import { Relic } from '../types';
import { ALL_RELICS } from '../core/Constants';

export class RelicManager {
  private activeRelics: Relic[] = [];

  public reset(): void {
    this.activeRelics = [];
  }

  public getActiveRelics(): readonly Relic[] {
    return this.activeRelics;
  }

  public hasRelic(id: string): boolean {
    return this.activeRelics.some((r) => r.id === id);
  }

  public addRelic(relic: Relic): boolean {
    if (this.hasRelic(relic.id)) return false;
    this.activeRelics.push(relic);
    return true;
  }

  public rollDraft(count = 3): Relic[] {
    // 優先選取玩家尚未持有的遺物
    const available = ALL_RELICS.filter((r) => !this.hasRelic(r.id));
    const pool = available.length >= count ? available : [...ALL_RELICS];

    // 洗牌抽樣
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count);
  }
}
