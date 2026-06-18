// Word lists for different difficulty levels

const easyLetters = 'abcdefghijklmnopqrstuvwxyz'.split('');

const easyWords = [
  'the', 'cat', 'dog', 'run', 'big', 'red', 'hat', 'bed', 'cup', 'pen',
  'sun', 'map', 'box', 'fox', 'egg', 'ant', 'bee', 'cow', 'duck', 'fish',
  'bird', 'book', 'cake', 'door', 'fish', 'tree', 'star', 'rain', 'snow', 'ball',
  'blue', 'cold', 'dark', 'easy', 'fast', 'gold', 'hand', 'jump', 'kind', 'lamp',
  'milk', 'nest', 'open', 'play', 'quiz', 'rest', 'soft', 'talk', 'used', 'very',
  'warm', 'yard', 'zero', 'long', 'high', 'soon', 'late', 'fill', 'pick', 'look',
];

const mediumWords = [
  'apple', 'beach', 'cloud', 'dance', 'eagle', 'flame', 'grape', 'house',
  'ivory', 'jewel', 'knife', 'lemon', 'magic', 'night', 'ocean', 'piano',
  'queen', 'river', 'stone', 'tiger', 'umbra', 'vivid', 'whale', 'xenon',
  'yacht', 'zebra', 'brain', 'crisp', 'dream', 'eager', 'faith', 'ghost',
  'happy', 'icing', 'jaunt', 'kebab', 'latch', 'mango', 'nerve', 'orbit',
  'pearl', 'quest', 'ridge', 'sweet', 'torch', 'using', 'vocal', 'wrist',
  'admin', 'basic', 'cross', 'delta', 'earth', 'frost', 'green', 'hello',
];

const hardWords = [
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

// Programming keywords for hard mode
const codingWords = [
  'array', 'async', 'await', 'break', 'class', 'const', 'fetch', 'finally',
  'match', 'merge', 'parse', 'proxy', 'query', 'react', 'redux', 'render',
  'route', 'scope', 'slice', 'split', 'store', 'style', 'table', 'tuple',
  'types', 'unbox', 'unset', 'vnode', 'while', 'yield', 'alloc', 'bench',
  'cache', 'cycle', 'debug', 'event', 'field', 'frame', 'graph', 'index',
  'input', 'layer', 'macro', 'model', 'mount', 'never', 'nodes', 'order',
];

export function getRandomLetter(): string {
  return easyLetters[Math.floor(Math.random() * easyLetters.length)];
}

export function getRandomWord(mode: 'easy' | 'medium' | 'hard'): string {
  const pool = mode === 'easy' ? easyWords
    : mode === 'medium' ? mediumWords
    : [...hardWords, ...codingWords];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getWordsForDifficulty(level: number): string[] {
  if (level <= 3) return easyWords;
  if (level <= 6) return mediumWords;
  return [...hardWords, ...codingWords];
}