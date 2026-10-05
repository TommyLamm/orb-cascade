import { Monster } from '../entities/Monster';

export class DungeonProgress {
  public currentFloor = 1;
  public readonly maxFloor = 10;
  public score = 0;
  public playerHp = 100;
  public maxPlayerHp = 100;
  public manaOrbs = 5;
  public maxManaOrbs = 5;
  public totalKills = 0;

  public currentMonster: Monster;

  constructor() {
    this.currentMonster = new Monster(this.currentFloor);
  }

  public resetRun(): void {
    this.currentFloor = 1;
    this.score = 0;
    this.playerHp = 100;
    this.manaOrbs = 5;
    this.totalKills = 0;
    this.currentMonster = new Monster(this.currentFloor);
  }

  public advanceFloor(): boolean {
    if (this.currentFloor >= this.maxFloor) {
      return false; // 通關
    }
    this.currentFloor++;
    this.totalKills++;
    // 通關一層回復 1 顆彈珠與 25 點血量
    this.manaOrbs = Math.min(this.maxManaOrbs, this.manaOrbs + 1);
    this.playerHp = Math.min(this.maxPlayerHp, this.playerHp + 25);
    this.currentMonster = new Monster(this.currentFloor);
    return true;
  }

  public isFinalFloorCleared(): boolean {
    return this.currentFloor === this.maxFloor && !this.currentMonster.isAlive();
  }
}
