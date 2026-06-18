import { useRef, useEffect, useCallback } from 'react';
import { GameEngine } from '../game/GameEngine';
import type { GameState } from '../types/game';
import { SoundManager } from '../hooks/useSound';

interface GameCanvasProps {
  engineRef: React.MutableRefObject<GameEngine | null>;
  onStateChange: (state: GameState) => void;
  soundManager: SoundManager;
  isPlaying: boolean;
}

export function GameCanvas({ engineRef, onStateChange, soundManager, isPlaying }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const renderLoop = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    engine.render(ctx);
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [engineRef]);

  // Initialize engine
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const engine = new GameEngine(width, height, onStateChange, soundManager);
    engineRef.current = engine;

    // Start render loop (renders even when idle - shows background)
    renderLoop();

    return () => {
      engine.destroy();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!container || !canvas || !engine) return;

      const width = container.clientWidth;
      const height = container.clientHeight;

      canvas.width = width;
      canvas.height = height;
      engine.resize(width, height);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [engineRef]);

  // Handle keyboard input
  useEffect(() => {
    if (!isPlaying) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (e.key === 'Escape') {
        engine.pause();
        return;
      }

      engine.handleKeyPress(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, engineRef]);

  return (
    <div
      ref={containerRef}
      className="game-canvas-container"
    >
      <canvas
        ref={canvasRef}
        className="game-canvas"
      />
    </div>
  );
}