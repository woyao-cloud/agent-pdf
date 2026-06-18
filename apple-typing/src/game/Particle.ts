import type { Particle } from '../types/game';

const COLORS = [
  '#FF2D2D', '#FF4444', '#FF6666', '#FF8888',
  '#FFAA00', '#FFCC00', '#FFFFFF', '#FFE0E0',
];

export function createExplosion(x: number, y: number, count: number = 20): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      maxLife: 0.4 + Math.random() * 0.6,
      size: 3 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    });
  }
  return particles;
}

export function createMissEffect(x: number, y: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 2,
      life: 1,
      maxLife: 0.3,
      size: 2 + Math.random() * 3,
      color: '#FF0000',
    });
  }
  return particles;
}

export function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles
    .map(p => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vy: p.vy + 0.15,  // gravity
      life: p.life - dt / p.maxLife,
      size: p.size * 0.98,
    }))
    .filter(p => p.life > 0);
}

export function renderParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}