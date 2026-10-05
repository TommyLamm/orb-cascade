export type GameState = 
  | 'BOOT'
  | 'TITLE'
  | 'RUN_INIT'
  | 'BATTLE_AIM'
  | 'BATTLE_SIMULATING'
  | 'TURN_RESOLVE'
  | 'RELIC_DRAFT'
  | 'FLOOR_ADVANCE'
  | 'PAUSED'
  | 'GAME_OVER'
  | 'VICTORY';

export type PegType = 
  | 'REGULAR' 
  | 'WEAKPOINT' 
  | 'MUSHROOM' 
  | 'TNT' 
  | 'PORTAL' 
  | 'RESET'
  | 'SHIELD_CORE'
  | 'MINION';

export interface TrajectoryPoint {
  x: number;
  y: number;
  isBounce: boolean;
}

export interface Relic {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconColor: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}

export interface MonsterData {
  floor: number;
  name: string;
  title: string;
  maxHp: number;
  currentHp: number;
  attackInterval: number; // 倒數回合數
  currentCountdown: number;
  attackDamage: number;
  isBoss: boolean;
  specialSkillName: string;
  hasShield: boolean;
  shieldMax: number;
  shieldCurrent: number;
  minionCooldown: number;
}

export interface OrbCascadeSave {
  version: 2;
  highScore: number;
  highestFloor: number;
  totalRuns: number;
  totalKills: number;
  isMuted: boolean;
  highestCombo: number;
  bossShieldsBroken: number;
}

export interface PlayroomReadyState {
  available: boolean;
  mode: 'authenticated' | 'guest' | 'preview' | 'standalone';
}
