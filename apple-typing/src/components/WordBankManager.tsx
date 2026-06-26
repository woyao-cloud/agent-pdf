import { useState } from 'react';
import type { WordBank } from '../types/game';

interface WordBankManagerProps {
  banks: WordBank[];
  activeBankId: string | null;
  onActivate: (id: string | null) => void;
  onAdd: (name: string, items: string[], type: 'letter' | 'word') => void;
  onUpdate: (id: string, updates: Partial<WordBank>) => void;
  onDelete: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'list' | 'create';

export function WordBankManager({
  banks,
  activeBankId,
  onActivate,
  onAdd,
  onUpdate,
  onDelete,
  isOpen,
  onClose,
}: WordBankManagerProps) {
  const [tab, setTab] = useState<Tab>('list');
  const [editId, setEditId] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newItems, setNewItems] = useState('');
  const [newType, setNewType] = useState<'letter' | 'word'>('letter');

  if (!isOpen) return null;

  const handleCreate = () => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    const items = newItems
      .split(/[\s,，、\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    if (items.length === 0) return;

    onAdd(trimmedName, items, newType);
    setNewName('');
    setNewItems('');
    setTab('list');
  };

  const bankTypeLabel = (type: 'letter' | 'word') =>
    type === 'letter' ? '🔤 字母' : '📝 单词';

  const isBuiltin = (id: string) => id.startsWith('builtin-');

  return (
    <div className="overlay wb-overlay" onClick={onClose}>
      <div className="wb-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="wb-header">
          <h2>📚 字库管理</h2>
          <button className="wb-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="wb-tabs">
          <button
            className={`wb-tab ${tab === 'list' ? 'active' : ''}`}
            onClick={() => { setTab('list'); setEditId(null); }}
          >
            字库列表
          </button>
          <button
            className={`wb-tab ${tab === 'create' ? 'active' : ''}`}
            onClick={() => setTab('create')}
          >
            ➕ 新建字库
          </button>
        </div>

        {/* Tab content */}
        <div className="wb-body">
          {tab === 'list' && (
            <div className="wb-list">
              {/* Default option */}
              <div
                className={`wb-item ${activeBankId === null ? 'active' : ''}`}
                onClick={() => onActivate(null)}
              >
                <div className="wb-item-left">
                  <span className="wb-item-icon">📋</span>
                  <div className="wb-item-info">
                    <span className="wb-item-name">默认字库（内置）</span>
                    <span className="wb-item-meta">使用游戏内置的字母/单词</span>
                  </div>
                </div>
                <div className="wb-item-right">
                  {activeBankId === null && <span className="wb-active-badge">✓ 激活</span>}
                </div>
              </div>

              {/* Word banks */}
              {banks.map(bank => (
                <div
                  key={bank.id}
                  className={`wb-item ${activeBankId === bank.id ? 'active' : ''}`}
                >
                  <div
                    className="wb-item-left"
                    onClick={() => onActivate(bank.id)}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <span className="wb-item-icon">🍎</span>
                    <div className="wb-item-info">
                      <span className="wb-item-name">{bank.name}</span>
                      <span className="wb-item-meta">
                        {bankTypeLabel(bank.type)} · {bank.items.length} 项
                        {isBuiltin(bank.id) ? ' · 内置' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="wb-item-right">
                    {activeBankId === bank.id && (
                      <span className="wb-active-badge">✓ 激活</span>
                    )}

                    {/* Edit button (not for built-in) */}
                    {!isBuiltin(bank.id) && (
                      <>
                        <button
                          className="wb-item-btn"
                          onClick={() => setEditId(editId === bank.id ? null : bank.id)}
                          title="编辑字库"
                        >
                          ✏️
                        </button>
                        <button
                          className="wb-item-btn wb-item-btn-danger"
                          onClick={() => {
                            if (confirm(`确定删除字库 "${bank.name}"？`)) {
                              onDelete(bank.id);
                              if (activeBankId === bank.id) {
                                onActivate(null);
                              }
                            }
                          }}
                          title="删除字库"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {banks.length === 0 && (
                <div className="wb-empty">
                  还没有自定义字库，点击"新建字库"创建一个
                </div>
              )}
            </div>
          )}

          {tab === 'create' && (
            <div className="wb-create">
              <div className="wb-form-row">
                <label className="wb-label">字库名称</label>
                <input
                  type="text"
                  className="wb-input"
                  placeholder="例如：Python 关键字、日语五十音..."
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>

              <div className="wb-form-row">
                <label className="wb-label">类型</label>
                <div className="wb-type-group">
                  <button
                    className={`wb-type-btn ${newType === 'letter' ? 'active' : ''}`}
                    onClick={() => setNewType('letter')}
                  >
                    🔤 字母模式（每个苹果一个字符）
                  </button>
                  <button
                    className={`wb-type-btn ${newType === 'word' ? 'active' : ''}`}
                    onClick={() => setNewType('word')}
                  >
                    📝 单词模式（每个苹果一个单词）
                  </button>
                </div>
              </div>

              <div className="wb-form-row">
                <label className="wb-label">
                  字库内容
                  <span className="wb-label-hint">
                    （每行一个，或用空格/逗号隔开）
                  </span>
                </label>
                <textarea
                  className="wb-textarea"
                  placeholder={
                    newType === 'letter'
                      ? 'a\nb\nc\nd\ne\nf\ng\n...'
                      : 'hello\nworld\nreact\ntypescript\n...'
                  }
                  rows={10}
                  value={newItems}
                  onChange={e => setNewItems(e.target.value)}
                />
              </div>

              <div className="wb-form-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setTab('list')}
                >
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newItems.trim()}
                >
                  ✅ 创建字库
                </button>
              </div>
            </div>
          )}

          {/* Edit inline */}
          {editId && (
            <EditWordBank
              bank={banks.find(b => b.id === editId)!}
              onSave={(updates) => {
                onUpdate(editId, updates);
                setEditId(null);
              }}
              onCancel={() => setEditId(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EditWordBank({
  bank,
  onSave,
  onCancel,
}: {
  bank: WordBank;
  onSave: (updates: Partial<WordBank>) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState(bank.items.join('\n'));
  const [name, setName] = useState(bank.name);

  return (
    <div className="wb-edit-overlay-inline">
      <div className="wb-edit-inline">
        <h3>编辑：{bank.name}</h3>
        <div className="wb-form-row">
          <label className="wb-label">名称</label>
          <input
            type="text"
            className="wb-input"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="wb-form-row">
          <label className="wb-label">内容（每行一个）</label>
          <textarea
            className="wb-textarea"
            rows={10}
            value={items}
            onChange={e => setItems(e.target.value)}
          />
        </div>
        <div className="wb-form-actions">
          <button className="btn btn-secondary btn-small" onClick={onCancel}>取消</button>
          <button
            className="btn btn-primary btn-small"
            onClick={() => {
              const parsed = items.split('\n').map(s => s.trim()).filter(s => s.length > 0);
              if (parsed.length === 0) return;
              onSave({ name: name.trim(), items: parsed });
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}