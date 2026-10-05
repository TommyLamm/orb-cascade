import { Monster } from '../entities/Monster';
import { GameMode } from '../types';

export class DungeonProgress {
  public mode: GameMode = 'STANDARD';
  public currentFloor = 1;
  public readonly standardMaxFloor = 10;
  public score = 0;
  public playerHp = 100;
  public maxPlayerHp = 100;
  public manaOrbs = 5;
  public maxManaOrbs = 5;
  public totalKills = 0;
  public scoreMultiplier = 1.0;

  public currentMonster: Monster;

  constructor(mode: GameMode = 'STANDARD') {
    this.mode = mode;
    this.currentMonster = new Monster(this.currentFloor, mode === 'ENDLESS', 1.0);
  }

  public resetRun(mode: GameMode = 'STANDARD', scoreMult = 1.0): void {
    this.mode = mode;
    this.currentFloor = 1;
    this.score = 0;
    this.playerHp = 100;
    this.manaOrbs = 5;
    this.totalKills = 0;
    this.scoreMultiplier = scoreMult;
    this.currentMonster = new Monster(this.currentFloor, mode === 'ENDLESS', 1.0);
  }

  public advanceFloor(): boolean {
    if (this.mode === 'STANDARD' && this.currentFloor >= this.standardMaxFloor) {
      return false; // 標準模式通關
    }

    this.currentFloor++;
    this.totalKills++;

    // 通關一層回復 1 顆彈珠與 25 點血量
    this.manaOrbs = Math.min(this.maxManaOrbs + 2, this.manaOrbs + 1);
    this.playerHp = Math.min(this.maxPlayerHp, this.playerHp + 25);

    // 無盡模式下怪物 HP 與數值膨脹
    const hpMult = this.mode === 'ENDLESS'
      ? Math.pow(1.22, Math.max(0, this.currentFloor - 1))
      : 1.0;

    this.currentMonster = new Monster(this.currentFloor, this.mode === 'ENDLESS', hpMult);
    return true;
  }

  public isFinalFloorCleared(): boolean {
    if (this.mode === 'ENDLESS') return false; // 無盡模式永不強制結束
    return this.currentFloor === this.standardMaxFloor && !this.currentMonster.isAlive();
  }
}
