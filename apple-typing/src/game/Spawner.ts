import type { Apple, GameConfig, WordBank } from '../types/game';
import { createApple } from './Apple';

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
  config: GameConfig,
  activeWordBank: WordBank | null,
): Apple {
  return createApple(canvasWidth, config.mode, activeWordBank);
}

export function calculateAppleSpeed(config: GameConfig): number {
  return 0.5 + config.fallSpeed * 0.35;
}