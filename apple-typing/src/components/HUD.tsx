interface HUDProps {
  score: number;
  lives: number;
  combo: number;
  highScore: number;
  phase: string;
  onPause: () => void;
  onResume: () => void;
  wordBuffer?: string;
  activeBankName?: string | null;
}

export function HUD({
  score,
  lives,
  combo,
  highScore,
  phase,
  onPause,
  onResume,
  wordBuffer,
  activeBankName,
}: HUDProps) {
  return (
    <div className="hud">
      <div className="hud-left">
        <div className="hud-score">
          <span className="hud-label">分数</span>
          <span className="hud-value">{score}</span>
        </div>
        <div className="hud-highscore">
          <span className="hud-label">最高</span>
          <span className="hud-value">{highScore}</span>
        </div>
      </div>

      <div className="hud-center">
        <div className="hud-lives">
          {Array.from({ length: lives }, (_, i) => (
            <span key={i} className="hud-heart">🍎</span>
          ))}
        </div>
        {combo >= 3 && (
          <div className="hud-combo">
            <span className="combo-text">🔥 x{combo}</span>
          </div>
        )}
        {wordBuffer && (
          <div className="hud-word-buffer">{wordBuffer}</div>
        )}
        {activeBankName && (
          <div className="hud-bank-name" title="当前字库">
            📖 {activeBankName}
          </div>
        )}
      </div>

      <div className="hud-right">
        <button
          className="hud-btn"
          onClick={phase === 'paused' ? onResume : onPause}
          title={phase === 'paused' ? '继续' : '暂停'}
        >
          {phase === 'paused' ? '▶' : '⏸'}
        </button>
      </div>
    </div>
  );
}