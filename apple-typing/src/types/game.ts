// ===== Core Game Types =====

export type GameMode = 'letter' | 'word';
export type GamePhase = 'idle' | 'playing' | 'paused' | 'gameover';

export interface Apple {
  id: number;
  x: number;
  y: number;
  speed: number;
  letter: string;
  rotation: number;
  rotationSpeed: number;
  state: 'falling' | 'hit' | 'missed';
  width: number;
  height: number;
  opacity: number;
  createdAt: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface GameConfig {
  fallSpeed: number;       // 1-10
  spawnInterval: number;   // ms between spawns (500-3000)
  mode: GameMode;
  lives: number;
  volume: number;          // 0-100
  soundEnabled: boolean;
  activeWordBankId: string | null;  // null = use built-in defaults
}

export interface GameState {
  apples: Apple[];
  particles: Particle[];
  score: number;
  lives: number;
  combo: number;
  maxCombo: number;
  phase: GamePhase;
  config: GameConfig;
  appleIdCounter: number;
  lastSpawnTime: number;
  startTime: number;
  typedHistory: string[];  // last typed letters for display
}

export interface WordBank {
  id: string;
  name: string;
  items: string[];
  type: 'letter' | 'word';
  createdAt: number;
}

export type GameEvent =
  | { type: 'TICK'; now: number }
  | { type: 'KEYPRESS'; key: string }
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RESTART' }
  | { type: 'SET_CONFIG'; config: Partial<GameConfig> };