import { useState, useRef, useCallback, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { StartScreen } from './components/StartScreen';
import { GameOverModal } from './components/GameOverModal';
import { SettingsPanel } from './components/SettingsPanel';
import { WordBankManager } from './components/WordBankManager';
import { GameEngine } from './game/GameEngine';
import type { GameState, GamePhase } from './types/game';
import { useSettings } from './hooks/useSettings';
import { loadHighScore } from './hooks/useScore';
import { useWordBank, getWordBankById } from './hooks/useWordBank';
import { SoundManager } from './hooks/useSound';
import './App.css';

function App() {
  const engineRef = useRef<GameEngine | null>(null);
  const soundManagerRef = useRef<SoundManager>(new SoundManager());
  const [gamePhase, setGamePhase] = useState<GamePhase>('idle');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showWordBank, setShowWordBank] = useState(false);
  const { settings, updateSetting, resetSettings } = useSettings();
  const {
    banks,
    addBank,
    updateBank,
    deleteBank,
    getBankName,
  } = useWordBank();

  // High score display
  const [highScore, setHighScore] = useState(loadHighScore);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  // For gameover stats display
  const [lastGameScore, setLastGameScore] = useState(0);
  const [lastGameMaxCombo, setLastGameMaxCombo] = useState(0);

  // Active word bank name for HUD display
  const activeBankName = settings.activeWordBankId
    ? getBankName(settings.activeWordBankId)
    : null;

  const handleStateChange = useCallback((state: GameState) => {
    setGameState(state);
  }, []);

  // Sync settings and word bank to engine
  useEffect(() => {
    const engine = engineRef.current;
    if (engine) {
      engine.updateConfig(settings);
      const bank = getWordBankById(settings.activeWordBankId);
      engine.setActiveWordBank(bank);
    }
    soundManagerRef.current.volume = settings.volume;
    soundManagerRef.current.enabled = settings.soundEnabled;
  }, [settings]);

  const handleActivateBank = useCallback((id: string | null) => {
    updateSetting('activeWordBankId', id);
  }, [updateSetting]);

  const handleStart = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.updateConfig(settings);
    const bank = getWordBankById(settings.activeWordBankId);
    engine.setActiveWordBank(bank);
    soundManagerRef.current.playStartBeep();
    engine.start();
    setGamePhase('playing');
    setIsNewHighScore(false);
  }, [settings]);

  const handleRestart = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.updateConfig(settings);
    const bank = getWordBankById(settings.activeWordBankId);
    engine.setActiveWordBank(bank);
    engine.restart();
    setGamePhase('playing');
    setIsNewHighScore(false);
  }, [settings]);

  const handleHome = useCallback(() => {
    setGamePhase('idle');
    setIsNewHighScore(false);
  }, []);

  const handlePause = useCallback(() => {
    engineRef.current?.pause();
    setGamePhase('paused');
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
    setGamePhase('playing');
  }, []);

  // Detect game over from state changes
  useEffect(() => {
    if (gameState?.phase === 'gameover' && gamePhase !== 'gameover') {
      setGamePhase('gameover');
      setLastGameScore(gameState.score);
      setLastGameMaxCombo(gameState.maxCombo);

      const hs = loadHighScore();
      setHighScore(hs);
      if (gameState.score >= hs && gameState.score > 0) {
        setIsNewHighScore(true);
      }
    }
  }, [gameState?.phase, gamePhase]);

  return (
    <div className="app">
      <GameCanvas
        engineRef={engineRef}
        onStateChange={handleStateChange}
        soundManager={soundManagerRef.current}
        isPlaying={gamePhase === 'playing'}
      />

      {/* Floating action buttons */}
      <div className="fab-group">
        <button
          className="fab fab-wordbank"
          onClick={() => setShowWordBank(true)}
          title="字库管理"
        >
          📚
        </button>
        <button
          className="fab fab-settings"
          onClick={() => setShowSettings(true)}
          title="设置"
        >
          ⚙️
        </button>
      </div>

      {/* Start Screen */}
      {gamePhase === 'idle' && (
        <StartScreen
          highScore={highScore}
          onStart={handleStart}
          activeBankName={activeBankName}
        />
      )}

      {/* HUD (during gameplay) */}
      {(gamePhase === 'playing' || gamePhase === 'paused') && gameState && (
        <HUD
          score={gameState.score}
          lives={gameState.lives}
          combo={gameState.combo}
          highScore={highScore}
          phase={gamePhase}
          onPause={handlePause}
          onResume={handleResume}
          activeBankName={activeBankName}
        />
      )}

      {/* Pause overlay */}
      {gamePhase === 'paused' && (
        <div className="overlay pause-overlay">
          <div className="overlay-content">
            <h2>⏸ 已暂停</h2>
            <p>按下方按钮继续</p>
            <button className="btn btn-primary" onClick={handleResume}>
              继续游戏
            </button>
          </div>
        </div>
      )}

      {/* Game Over */}
      {gamePhase === 'gameover' && (
        <GameOverModal
          score={lastGameScore}
          highScore={highScore}
          maxCombo={lastGameMaxCombo}
          isNewHighScore={isNewHighScore}
          onRestart={handleRestart}
          onHome={handleHome}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel
        settings={settings}
        onUpdate={updateSetting}
        onReset={resetSettings}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Word Bank Manager */}
      <WordBankManager
        banks={banks}
        activeBankId={settings.activeWordBankId}
        onActivate={handleActivateBank}
        onAdd={addBank}
        onUpdate={updateBank}
        onDelete={deleteBank}
        isOpen={showWordBank}
        onClose={() => setShowWordBank(false)}
      />
    </div>
  );
}

export default App;