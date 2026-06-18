import { useState, useCallback } from 'react';
import type { GameConfig } from '../types/game';

const STORAGE_KEY = 'apple-typing-settings';

const DEFAULT_SETTINGS: GameConfig = {
  fallSpeed: 3,
  spawnInterval: 5,
  mode: 'letter',
  lives: 5,
  volume: 70,
  soundEnabled: true,
  activeWordBankId: null,
};

function loadSettings(): GameConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: GameConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<GameConfig>(loadSettings);

  const updateSetting = useCallback(<K extends keyof GameConfig>(
    key: K,
    value: GameConfig[K],
  ) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    saveSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSetting, resetSettings };
}