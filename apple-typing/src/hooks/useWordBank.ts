import { useState, useCallback, useEffect } from 'react';
import type { WordBank } from '../types/game';

const STORAGE_KEY = 'apple-typing-wordbanks';

// Built-in default word banks
const DEFAULT_WORD_BANKS: WordBank[] = [
  {
    id: 'builtin-letters',
    name: '字母表 a-z',
    items: 'abcdefghijklmnopqrstuvwxyz'.split(''),
    type: 'letter',
    createdAt: 0,
  },
  {
    id: 'builtin-easy',
    name: '简单单词',
    items: [
      'the', 'cat', 'dog', 'run', 'big', 'red', 'hat', 'bed', 'cup', 'pen',
      'sun', 'map', 'box', 'fox', 'egg', 'ant', 'bee', 'cow', 'duck', 'fish',
      'bird', 'book', 'cake', 'door', 'fish', 'tree', 'star', 'rain', 'snow', 'ball',
      'blue', 'cold', 'dark', 'easy', 'fast', 'gold', 'hand', 'jump', 'kind', 'lamp',
      'milk', 'nest', 'open', 'play', 'quiz', 'rest', 'soft', 'talk', 'used', 'very',
      'warm', 'yard', 'zero', 'long', 'high', 'soon', 'late', 'fill', 'pick', 'look',
    ],
    type: 'word',
    createdAt: 0,
  },
  {
    id: 'builtin-medium',
    name: '中等单词',
    items: [
      'apple', 'beach', 'cloud', 'dance', 'eagle', 'flame', 'grape', 'house',
      'ivory', 'jewel', 'knife', 'lemon', 'magic', 'night', 'ocean', 'piano',
      'queen', 'river', 'stone', 'tiger', 'umbra', 'vivid', 'whale', 'xenon',
      'yacht', 'zebra', 'brain', 'crisp', 'dream', 'eager', 'faith', 'ghost',
      'happy', 'icing', 'jaunt', 'kebab', 'latch', 'mango', 'nerve', 'orbit',
      'pearl', 'quest', 'ridge', 'sweet', 'torch', 'using', 'vocal', 'wrist',
      'admin', 'basic', 'cross', 'delta', 'earth', 'frost', 'green', 'hello',
    ],
    type: 'word',
    createdAt: 0,
  },
  {
    id: 'builtin-hard',
    name: '困难单词 + 编程',
    items: [
      'journey', 'python', 'knight', 'brazil', 'crystal', 'dragon', 'silver',
      'planet', 'wonder', 'market', 'garden', 'bridge', 'window', 'school',
      'forest', 'island', 'castle', 'button', 'circle', 'degree', 'effect',
      'flight', 'golden', 'hunter', 'impact', 'jungle', 'kettle', 'ladder',
      'master', 'nature', 'orange', 'pocket', 'rescue', 'shield', 'tunnel',
      'unique', 'valley', 'weapon', 'yearly', 'absorb', 'branch', 'cotton',
      'detail', 'empire', 'filter', 'garlic', 'heaven', 'inject', 'kidney',
      'liquid', 'mammal', 'nozzle', 'oxygen', 'pickle', 'quartz', 'rocket',
      'sample', 'temple', 'unfair', 'velvet', 'wiggle', 'zephyr', 'bamboo',
      'array', 'async', 'await', 'break', 'class', 'const', 'fetch', 'finally',
      'match', 'merge', 'parse', 'proxy', 'query', 'react', 'redux', 'render',
    ],
    type: 'word',
    createdAt: 0,
  },
];

let cachedBanks: WordBank[] | null = null;

function loadBanks(): WordBank[] {
  if (cachedBanks) return cachedBanks;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: WordBank[] = JSON.parse(stored);
      // Merge built-in with stored (stored overrides built-in of same id)
      const merged = [...DEFAULT_WORD_BANKS];
      for (const bank of parsed) {
        const idx = merged.findIndex(b => b.id === bank.id);
        if (idx >= 0) {
          // Only override non-built-in
          if (!bank.id.startsWith('builtin-')) {
            merged[idx] = bank;
          }
        } else {
          merged.push(bank);
        }
      }
      cachedBanks = merged;
      return merged;
    }
  } catch {
    // ignore
  }
  cachedBanks = [...DEFAULT_WORD_BANKS];
  return cachedBanks;
}

function persistBanks(banks: WordBank[]) {
  cachedBanks = banks;
  try {
    // Only persist non-built-in banks
    const custom = banks.filter(b => !b.id.startsWith('builtin-'));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    // ignore
  }
}

export function getWordBankById(id: string | null): WordBank | null {
  if (!id) return null;
  return loadBanks().find(b => b.id === id) || null;
}

export function getRandomItem(wordBank: WordBank): string {
  return wordBank.items[Math.floor(Math.random() * wordBank.items.length)];
}

export function useWordBank() {
  const [banks, setBanks] = useState<WordBank[]>(loadBanks);

  // Refresh if external changes
  useEffect(() => {
    setBanks(loadBanks());
  }, []);

  const refresh = useCallback(() => {
    setBanks(loadBanks());
  }, []);

  const addBank = useCallback((name: string, items: string[], type: 'letter' | 'word'): WordBank => {
    const newBank: WordBank = {
      id: 'custom-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name,
      items,
      type,
      createdAt: Date.now(),
    };
    const updated = [...banks, newBank];
    persistBanks(updated);
    setBanks(updated);
    return newBank;
  }, [banks]);

  const updateBank = useCallback((id: string, updates: Partial<WordBank>) => {
    const updated = banks.map(b => b.id === id ? { ...b, ...updates } : b);
    persistBanks(updated);
    setBanks(updated);
  }, [banks]);

  const deleteBank = useCallback((id: string) => {
    if (id.startsWith('builtin-')) return; // don't delete built-ins
    const updated = banks.filter(b => b.id !== id);
    persistBanks(updated);
    setBanks(updated);
  }, [banks]);

  const getBankName = useCallback((id: string | null): string => {
    if (!id) return '默认字库';
    const bank = banks.find(b => b.id === id);
    return bank ? bank.name : '默认字库';
  }, [banks]);

  return {
    banks,
    addBank,
    updateBank,
    deleteBank,
    refresh,
    getBankName,
  };
}