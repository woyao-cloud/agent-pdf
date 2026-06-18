import type {
  GameConfig,
  GameState,
} from '../types/game';
import { renderApple, loadAppleImage } from './Apple';
import { shouldSpawn, spawnApple, calculateAppleSpeed } from './Spawner';
import { findMatchingApple } from './InputHandler';
import {
  createExplosion,
  updateParticles,
  renderParticles,
} from './Particle';
import { SoundManager } from '../hooks/useSound';

const DEFAULT_CONFIG: GameConfig = {
  fallSpeed: 3,
  spawnInterval: 5,
  mode: 'letter',
  lives: 5,
  volume: 70,
  soundEnabled: true,
};

export function createInitialState(): GameState {
  return {
    apples: [],
    particles: [],
    score: 0,
    lives: DEFAULT_CONFIG.lives,
    combo: 0,
    maxCombo: 0,
    phase: 'idle',
    config: { ...DEFAULT_CONFIG },
    appleIdCounter: 0,
    lastSpawnTime: 0,
    startTime: 0,
    typedHistory: [],
  };
}

export class GameEngine {
  private state: GameState;
  private canvasWidth: number;
  private canvasHeight: number;
  private appleImage: HTMLImageElement | null = null;
  private soundManager: SoundManager;
  private onStateChange: (state: GameState) => void;
  private groundY: number;
  private animFrameId: number | null = null;
  private lastTime: number = 0;
  private missedFlashTimer: number = 0;

  constructor(
    canvasWidth: number,
    canvasHeight: number,
    onStateChange: (state: GameState) => void,
    soundManager: SoundManager,
  ) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.onStateChange = onStateChange;
    this.soundManager = soundManager;
    this.state = createInitialState();
    this.groundY = canvasHeight - 20;

    loadAppleImage('/images/apple.png').then(img => {
      this.appleImage = img;
    });
  }

  getState(): GameState {
    return this.state;
  }

  start() {
    this.state = createInitialState();
    this.state.phase = 'playing';
    this.state.startTime = performance.now();
    this.state.lastSpawnTime = performance.now();
    this.lastTime = performance.now();
    this.startLoop();
    this.emitState();
  }

  restart() {
    this.stopLoop();
    this.start();
  }

  pause() {
    if (this.state.phase === 'playing') {
      this.state.phase = 'paused';
      this.stopLoop();
      this.emitState();
    }
  }

  resume() {
    if (this.state.phase === 'paused') {
      this.state.phase = 'playing';
      this.lastTime = performance.now();
      this.startLoop();
      this.emitState();
    }
  }

  updateConfig(config: Partial<GameConfig>) {
    this.state.config = { ...this.state.config, ...config };
    this.emitState();
  }

  handleKeyPress(key: string) {
    if (this.state.phase !== 'playing') return;

    // Ignore modifier keys and non-printable
    if (key.length !== 1) return;
    if (!/^[a-zA-Z]$/.test(key)) return;

    const matched = findMatchingApple(
      this.state.apples,
      key,
    );

    if (matched) {
      // Correct match!
      matched.state = 'hit';
      this.state.particles.push(
        ...createExplosion(matched.x, matched.y),
      );
      this.state.score += 10 + this.state.combo * 2;
      this.state.combo += 1;
      if (this.state.combo > this.state.maxCombo) {
        this.state.maxCombo = this.state.combo;
      }
      this.state.typedHistory = [key.toUpperCase(), ...this.state.typedHistory].slice(0, 20);
      this.soundManager.playCorrect();
    } else {
      // Wrong key
      this.state.combo = 0;
      this.missedFlashTimer = 10; // frames
      this.state.typedHistory = [key.toUpperCase() + '✗', ...this.state.typedHistory].slice(0, 20);
      this.soundManager.playMiss();
    }

    this.emitState();
  }

  resize(width: number, height: number) {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.groundY = height - 20;
  }

  private startLoop() {
    const loop = (now: number) => {
      const dt = Math.min(now - this.lastTime, 50) / 16.67; // normalize to ~60fps
      this.lastTime = now;
      this.update(dt);
      this.emitState();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  private stopLoop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private update(dt: number) {
    const { apples, particles, config } = this.state;
    const now = performance.now();

    // ---- Spawn new apples ----
    if (shouldSpawn(now, this.state.lastSpawnTime, config)) {
      if (apples.filter(a => a.state === 'falling').length < 15) {
        const newApple = spawnApple(this.canvasWidth, this.canvasHeight, config);
        newApple.speed = calculateAppleSpeed(config);
        apples.push(newApple);
        this.state.lastSpawnTime = now;
      }
    }

    // ---- Update apples ----
    for (let i = apples.length - 1; i >= 0; i--) {
      const apple = apples[i];

      if (apple.state === 'hit') {
        apple.opacity -= 0.05 * dt;
        if (apple.opacity <= 0) {
          apples.splice(i, 1);
        }
        continue;
      }

      if (apple.state === 'missed') {
        apple.opacity -= 0.03 * dt;
        if (apple.opacity <= 0) {
          apples.splice(i, 1);
        }
        continue;
      }

      // Falling: move down
      apple.y += apple.speed * dt;
      apple.rotation += apple.rotationSpeed * dt;

      // Check if reached ground
      if (apple.y >= this.groundY) {
        apple.state = 'missed';
        this.state.lives -= 1;
        this.state.combo = 0;
        this.soundManager.playLoseLife();
        this.state.particles.push(
          ...createExplosion(apple.x, this.groundY, 10),
        );

        if (this.state.lives <= 0) {
          this.state.phase = 'gameover';
          this.stopLoop();
          this.soundManager.playGameOver();
        }
      }
    }

    // ---- Update particles ----
    this.state.particles = updateParticles(particles, dt);

    // ---- Miss flash timer ----
    if (this.missedFlashTimer > 0) {
      this.missedFlashTimer -= 1;
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvasHeight);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(0.6, '#B0E0E6');
    gradient.addColorStop(1, '#90EE90');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Ground
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, this.groundY, this.canvasWidth, this.canvasHeight - this.groundY);
    ctx.strokeStyle = '#388E3C';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, this.groundY);
    ctx.lineTo(this.canvasWidth, this.groundY);
    ctx.stroke();

    // Miss flash overlay
    if (this.missedFlashTimer > 5) {
      ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    // Apples
    for (const apple of this.state.apples) {
      renderApple(ctx, apple, this.appleImage);
    }

    // Particles
    renderParticles(ctx, this.state.particles);
  }

  private emitState() {
    this.onStateChange({ ...this.state });
  }

  destroy() {
    this.stopLoop();
  }
}