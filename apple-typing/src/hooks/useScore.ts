import { useState, useCallback } from 'react';

const HIGHSCORE_KEY = 'apple-typing-highscore';

export function loadHighScore(): number {
  try {
    const stored = localStorage.getItem(HIGHSCORE_KEY);
    return stored ? parseInt(stored, 10) : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(score: number): number {
  const current = loadHighScore();
  if (score > current) {
    try {
      localStorage.setItem(HIGHSCORE_KEY, score.toString());
    } catch {
      // ignore
    }
    return score;
  }
  return current;
}

export interface ScoreState {
  score: number;
  lives: number;
  combo: number;
  maxCombo: number;
  highScore: number;
}

export function useScore() {
  const [scoreState, setScoreState] = useState<ScoreState>({
    score: 0,
    lives: 5,
    combo: 0,
    maxCombo: 0,
    highScore: loadHighScore(),
  });

  const updateFromGame = useCallback((
    score: number,
    lives: number,
    combo: number,
    maxCombo: number,
  ) => {
    setScoreState(prev => ({
      ...prev,
      score,
      lives,
      combo,
      maxCombo,
    }));
  }, []);

  const finalizeScore = useCallback((score: number) => {
    const highScore = saveHighScore(score);
    setScoreState(prev => ({ ...prev, highScore }));
    return highScore;
  }, []);

  const reset = useCallback(() => {
    setScoreState(prev => ({
      score: 0,
      lives: 5,
      combo: 0,
      maxCombo: 0,
      highScore: prev.highScore,
    }));
  }, []);

  return { scoreState, updateFromGame, finalizeScore, reset };
}