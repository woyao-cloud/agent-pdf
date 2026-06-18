import type { Apple } from '../types/game';

export interface MatchResult {
  matched: Apple | null;
  typed: string;
}

/**
 * Find the lowest (closest to bottom) apple that matches the pressed key.
 * In letter mode: match single character
 * In word mode: we build up a typed buffer and match full words
 */
export function findMatchingApple(
  apples: Apple[],
  key: string,
): Apple | null {
  const lowerKey = key.toLowerCase();
  const fallingApples = apples.filter(a => a.state === 'falling');

  // Find all apples whose letter starts with the pressed key
  const candidates = fallingApples.filter(a =>
    a.letter.toLowerCase().startsWith(lowerKey),
  );

  if (candidates.length === 0) return null;

  // Return the one closest to the bottom (highest y value)
  candidates.sort((a, b) => b.y - a.y);
  return candidates[0];
}

/**
 * Find the apple closest to the bottom that matches the full word.
 * Used for word mode.
 */
export function findMatchingWordApple(
  apples: Apple[],
  word: string,
): Apple | null {
  const lowerWord = word.toLowerCase();
  const fallingApples = apples.filter(a => a.state === 'falling');

  const candidate = fallingApples.find(
    a => a.letter.toLowerCase() === lowerWord,
  );

  return candidate || null;
}

/**
 * Find any apple nearest to a given y threshold (for auto-miss detection)
 */
export function findLowestApple(
  apples: Apple[],
): Apple | null {
  void apples;
  const falling = apples.filter(a => a.state === 'falling');
  if (falling.length === 0) return null;
  return falling.reduce((lowest, a) => a.y > lowest.y ? a : lowest, falling[0]);
}