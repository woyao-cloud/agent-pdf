interface StartScreenProps {
  highScore: number;
  onStart: () => void;
}

export function StartScreen({ highScore, onStart }: StartScreenProps) {
  return (
    <div className="overlay start-screen">
      <div className="overlay-content">
        <div className="start-icon">🍎</div>
        <h1 className="start-title">Apple Typing</h1>
        <p className="start-subtitle">
          苹果打字游戏
        </p>
        <p className="start-desc">
          打字击落下落的苹果！输入苹果上的字母使其消失。
          <br />
          苹果落地会失去一条命。
        </p>

        <div className="start-controls">
          <div className="control-item">
            <span className="key-badge">A - Z</span>
            <span>输入字母</span>
          </div>
          <div className="control-item">
            <span className="key-badge">ESC</span>
            <span>暂停游戏</span>
          </div>
        </div>

        {highScore > 0 && (
          <p className="highscore-display">
            🏆 最高分: <strong>{highScore}</strong>
          </p>
        )}

        <button className="btn btn-primary btn-large" onClick={onStart}>
          开始游戏
        </button>
      </div>
    </div>
  );
}