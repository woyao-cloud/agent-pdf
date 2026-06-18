import type { Apple, GameConfig } from '../types/game';
import { createApple } from './Apple';

export interface SpawnResult {
  newApples: Apple[];
  nextSpawnTime: number;
}

export function shouldSpawn(
  now: number,
  lastSpawnTime: number,
  config: GameConfig,
): boolean {
  const interval = Math.max(400, 3000 - config.spawnInterval * 260);
  return (now - lastSpawnTime) >= interval;
}

export function spawnApple(
  canvasWidth: number,
  canvasHeight: number,
  config: GameConfig,
): Apple {
  return createApple(canvasWidth, canvasHeight, config.mode);
}

export function calculateAppleSpeed(config: GameConfig): number {
  // config.fallSpeed: 1-10 → speed: 0.8 - 4 px/frame
  return 0.5 + config.fallSpeed * 0.35;
}

export function maxApplesOnScreen(config: GameConfig): number {
  // More apples allowed at higher difficulty
  return Math.floor(8 + config.fallSpeed * 0.5);
}