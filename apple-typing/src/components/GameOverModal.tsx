interface GameOverModalProps {
  score: number;
  highScore: number;
  maxCombo: number;
  isNewHighScore: boolean;
  onRestart: () => void;
  onHome: () => void;
}

export function GameOverModal({
  score,
  highScore,
  maxCombo,
  isNewHighScore,
  onRestart,
  onHome,
}: GameOverModalProps) {
  return (
    <div className="overlay gameover-overlay">
      <div className="overlay-content gameover-content">
        <div className="gameover-icon">💥</div>
        <h2 className="gameover-title">游戏结束</h2>

        {isNewHighScore && (
          <div className="new-highscore">
            🎉 新纪录！🎉
          </div>
        )}

        <div className="gameover-stats">
          <div className="stat-item">
            <span className="stat-label">得分</span>
            <span className="stat-value">{score}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">最高分</span>
            <span className="stat-value">{highScore}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">最大连击</span>
            <span className="stat-value">x{maxCombo}</span>
          </div>
        </div>

        <div className="gameover-actions">
          <button className="btn btn-primary" onClick={onRestart}>
            再来一次
          </button>
          <button className="btn btn-secondary" onClick={onHome}>
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}