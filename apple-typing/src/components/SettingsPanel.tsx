import type { GameConfig, GameMode } from '../types/game';

interface SettingsPanelProps {
  settings: GameConfig;
  onUpdate: <K extends keyof GameConfig>(key: K, value: GameConfig[K]) => void;
  onReset: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({
  settings,
  onUpdate,
  onReset,
  isOpen,
  onClose,
}: SettingsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="overlay settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ 游戏设置</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* Fall Speed */}
          <div className="setting-row">
            <label className="setting-label">
              下落速度
              <span className="setting-value">{settings.fallSpeed}</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={settings.fallSpeed}
              onChange={e => onUpdate('fallSpeed', Number(e.target.value))}
              className="setting-slider"
            />
            <div className="setting-range-labels">
              <span>慢</span>
              <span>快</span>
            </div>
          </div>

          {/* Spawn Interval */}
          <div className="setting-row">
            <label className="setting-label">
              生成频率
              <span className="setting-value">{settings.spawnInterval}</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={settings.spawnInterval}
              onChange={e => onUpdate('spawnInterval', Number(e.target.value))}
              className="setting-slider"
            />
            <div className="setting-range-labels">
              <span>稀疏</span>
              <span>密集</span>
            </div>
          </div>

          {/* Game Mode */}
          <div className="setting-row">
            <label className="setting-label">游戏模式</label>
            <div className="setting-toggle-group">
              <button
                className={`toggle-btn ${settings.mode === 'letter' ? 'active' : ''}`}
                onClick={() => onUpdate('mode', 'letter' as GameMode)}
              >
                字母模式
              </button>
              <button
                className={`toggle-btn ${settings.mode === 'word' ? 'active' : ''}`}
                onClick={() => onUpdate('mode', 'word' as GameMode)}
              >
                单词模式
              </button>
            </div>
          </div>

          {/* Lives */}
          <div className="setting-row">
            <label className="setting-label">
              生命值
              <span className="setting-value">{settings.lives}</span>
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={settings.lives}
              onChange={e => onUpdate('lives', Number(e.target.value))}
              className="setting-slider"
            />
            <div className="setting-range-labels">
              <span>少</span>
              <span>多</span>
            </div>
          </div>

          {/* Volume */}
          <div className="setting-row">
            <label className="setting-label">
              音量
              <span className="setting-value">{settings.volume}</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.volume}
              onChange={e => {
                onUpdate('volume', Number(e.target.value));
                onUpdate('soundEnabled', Number(e.target.value) > 0);
              }}
              className="setting-slider"
            />
            <div className="setting-range-labels">
              <span>静音</span>
              <span>最大</span>
            </div>
          </div>

          {/* Sound toggle */}
          <div className="setting-row">
            <label className="setting-label">音效</label>
            <button
              className={`toggle-btn ${settings.soundEnabled ? 'active' : ''}`}
              onClick={() => onUpdate('soundEnabled', !settings.soundEnabled)}
            >
              {settings.soundEnabled ? '🔊 开启' : '🔇 关闭'}
            </button>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn btn-secondary btn-small" onClick={onReset}>
            重置默认
          </button>
          <button className="btn btn-primary btn-small" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}