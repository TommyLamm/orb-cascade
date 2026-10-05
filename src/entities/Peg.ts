import { PegType } from '../types';
import { ORB_PHYSICS } from '../core/Constants';

export class Peg {
  public id: number;
  public x: number;
  public y: number;
  public radius: number;
  public type: PegType;
  public isHitThisTurn = false;
  public isDestroyed = false;
  public pairedPortalId?: number;
  public glowPhase: number;
  public hitFlashTimer = 0; // 擊中瞬間的高光閃白計時

  constructor(
    id: number,
    x: number,
    y: number,
    type: PegType = 'REGULAR',
    pairedPortalId?: number
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.type = type;
    this.pairedPortalId = pairedPortalId;
    this.glowPhase = Math.random() * Math.PI * 2;

    switch (type) {
      case 'MUSHROOM':
        this.radius = ORB_PHYSICS.MUSHROOM_RADIUS;
        break;
      case 'TNT':
        this.radius = ORB_PHYSICS.TNT_RADIUS;
        break;
      case 'PORTAL':
        this.radius = ORB_PHYSICS.PORTAL_RADIUS;
        break;
      default:
        this.radius = ORB_PHYSICS.PEG_RADIUS;
        break;
    }
  }

  public update(dt: number): void {
    this.glowPhase += dt * 3.0;
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer < 0) this.hitFlashTimer = 0;
    }
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.25;
  }
}
