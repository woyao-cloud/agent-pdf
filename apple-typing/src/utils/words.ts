import { getWordBankById, getRandomItem } from '../hooks/useWordBank';

/**
 * Get a random item (letter or word) from the active word bank,
 * falling back to built-in defaults if no bank is active.
 */
export function getRandomFromWordBank(activeBankId: string | null, mode: 'letter' | 'word'): string {
  const bank = getWordBankById(activeBankId);

  if (bank && bank.items.length > 0) {
    return getRandomItem(bank);
  }

  // Fallback: use defaults from words.ts
  if (mode === 'letter') {
    return getRandomLetter();
  }
  return getRandomWord('easy');
}

function getRandomLetter(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return letters[Math.floor(Math.random() * letters.length)];
}

function getRandomWord(mode: 'easy' | 'medium' | 'hard'): string {
  const pool = mode === 'easy' ? EASY_WORDS
    : mode === 'medium' ? MEDIUM_WORDS
    : [...HARD_WORDS, ...CODING_WORDS];
  return pool[Math.floor(Math.random() * pool.length)];
}

const EASY_WORDS = [
  'the', 'cat', 'dog', 'run', 'big', 'red', 'hat', 'bed', 'cup', 'pen',
  'sun', 'map', 'box', 'fox', 'egg', 'ant', 'bee', 'cow', 'duck', 'fish',
  'bird', 'book', 'cake', 'door', 'fish', 'tree', 'star', 'rain', 'snow', 'ball',
  'blue', 'cold', 'dark', 'easy', 'fast', 'gold', 'hand', 'jump', 'kind', 'lamp',
  'milk', 'nest', 'open', 'play', 'quiz', 'rest', 'soft', 'talk', 'used', 'very',
  'warm', 'yard', 'zero', 'long', 'high', 'soon', 'late', 'fill', 'pick', 'look',
];

const MEDIUM_WORDS = [
  'apple', 'beach', 'cloud', 'dance', 'eagle', 'flame', 'grape', 'house',
  'ivory', 'jewel', 'knife', 'lemon', 'magic', 'night', 'ocean', 'piano',
  'queen', 'river', 'stone', 'tiger', 'umbra', 'vivid', 'whale', 'xenon',
  'yacht', 'zebra', 'brain', 'crisp', 'dream', 'eager', 'faith', 'ghost',
  'happy', 'icing', 'jaunt', 'kebab', 'latch', 'mango', 'nerve', 'orbit',
  'pearl', 'quest', 'ridge', 'sweet', 'torch', 'using', 'vocal', 'wrist',
  'admin', 'basic', 'cross', 'delta', 'earth', 'frost', 'green', 'hello',
];

const HARD_WORDS = [
  'journey', 'python', 'knight', 'brazil', 'crystal', 'dragon', 'silver',
  'planet', 'wonder', 'market', 'garden', 'bridge', 'window', 'school',
  'forest', 'island', 'castle', 'button', 'circle', 'degree', 'effect',
  'flight', 'golden', 'hunter', 'impact', 'jungle', 'kettle', 'ladder',
  'master', 'nature', 'orange', 'pocket', 'rescue', 'shield', 'tunnel',
  'unique', 'valley', 'weapon', 'yearly', 'absorb', 'branch', 'cotton',
  'detail', 'empire', 'filter', 'garlic', 'heaven', 'inject', 'kidney',
  'liquid', 'mammal', 'nozzle', 'oxygen', 'pickle', 'quartz', 'rocket',
  'sample', 'temple', 'unfair', 'velvet', 'wiggle', 'zephyr', 'bamboo',
];

const CODING_WORDS = [
  'array', 'async', 'await', 'break', 'class', 'const', 'fetch', 'finally',
  'match', 'merge', 'parse', 'proxy', 'query', 'react', 'redux', 'render',
  'route', 'scope', 'slice', 'split', 'store', 'style', 'table', 'tuple',
  'types', 'unbox', 'unset', 'vnode', 'while', 'yield', 'alloc', 'bench',
  'cache', 'cycle', 'debug', 'event', 'field', 'frame', 'graph', 'index',
  'input', 'layer', 'macro', 'model', 'mount', 'never', 'nodes', 'order',
];