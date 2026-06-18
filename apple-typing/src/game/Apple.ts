import type { Apple as AppleType, GameMode, WordBank } from '../types/game';
import { getRandomItem } from '../hooks/useWordBank';
import { getRandomFromWordBank } from '../utils/words';

let globalAppleId = 0;
let appleImage: HTMLImageElement | null = null;

export function loadAppleImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    if (appleImage) {
      resolve(appleImage);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      appleImage = img;
      resolve(img);
    };
    img.onerror = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 130;
      const ctx = canvas.getContext('2d')!;
      drawFallbackApple(ctx, 120, 130);
      const fallbackImg = new Image();
      fallbackImg.src = canvas.toDataURL();
      fallbackImg.onload = () => {
        appleImage = fallbackImg;
        resolve(fallbackImg);
      };
    };
    img.src = src;
  });
}

export function drawFallbackApple(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2 + 5;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 40, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main apple body
  const gradient = ctx.createRadialGradient(cx - 15, cy - 15, 5, cx, cy, 50);
  gradient.addColorStop(0, '#FF4444');
  gradient.addColorStop(0.4, '#DD2222');
  gradient.addColorStop(0.7, '#BB1111');
  gradient.addColorStop(1, '#880000');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 40);
  ctx.bezierCurveTo(cx - 40, cy - 45, cx - 50, cy + 5, cx - 45, cy + 25);
  ctx.bezierCurveTo(cx - 40, cy + 45, cx - 15, cy + 50, cx, cy + 45);
  ctx.bezierCurveTo(cx + 15, cy + 50, cx + 40, cy + 45, cx + 45, cy + 25);
  ctx.bezierCurveTo(cx + 50, cy + 5, cx + 40, cy - 45, cx, cy - 40);
  ctx.closePath();
  ctx.fill();

  // Highlight/shine
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx - 15, cy - 18, 12, 18, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx - 18, cy - 22, 5, 8, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Stem
  ctx.strokeStyle = '#5C3A1E';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 38);
  ctx.bezierCurveTo(cx + 5, cy - 50, cx + 8, cy - 55, cx + 3, cy - 58);
  ctx.stroke();

  // Leaf
  ctx.fillStyle = '#4CAF50';
  ctx.beginPath();
  ctx.ellipse(cx + 8, cy - 48, 10, 5, 0.5, 0, Math.PI * 2);
  ctx.fill();
}

export function createApple(
  canvasWidth: number,
  mode: GameMode,
  activeWordBank: WordBank | null,
): AppleType {
  // Pick a letter from the active word bank (or fallback to built-in)
  let letter: string;
  if (activeWordBank && activeWordBank.items.length > 0) {
    letter = getRandomItem(activeWordBank);
  } else {
    letter = getRandomFromWordBank(null, mode);
  }

  const size = mode === 'letter' ? 70 : 90;
  const padding = size;
  const x = padding + Math.random() * (canvasWidth - padding * 2);

  return {
    id: ++globalAppleId,
    x,
    y: -size,
    speed: 1 + Math.random() * 1.5,
    letter,
    rotation: (Math.random() - 0.5) * 0.3,
    rotationSpeed: (Math.random() - 0.5) * 0.02,
    state: 'falling',
    width: size,
    height: size * 1.1,
    opacity: 1,
    createdAt: Date.now(),
  };
}

export function resetAppleIdCounter() {
  globalAppleId = 0;
}

export function renderApple(
  ctx: CanvasRenderingContext2D,
  apple: AppleType,
  image: HTMLImageElement | null,
) {
  ctx.save();
  ctx.translate(apple.x, apple.y);
  ctx.rotate(apple.rotation);
  ctx.globalAlpha = apple.opacity;

  const w = apple.width;
  const h = apple.height;
  const hw = w / 2;
  const hh = h / 2;

  if (image) {
    ctx.drawImage(image, -hw, -hh, w, h);
  } else {
    drawFallbackApple(ctx, w, h);
  }

  // Draw letter on top of apple
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.font = `bold ${apple.letter.length > 2 ? 20 : 28}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(apple.letter.toUpperCase(), 0, 2);
  ctx.fillText(apple.letter.toUpperCase(), 0, 2);

  ctx.restore();
}