import { useEffect, useState } from 'react';

const STORAGE_KEY = 'hb-theme';

const readTheme = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* localStorage 不可用时退回浅色 */
  }
  return 'light';
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* 忽略写入失败 */
    }
  }, [theme]);

  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="toolbar-btn"
      onClick={() => setTheme(next)}
      aria-label={next === 'dark' ? '切换到暗色模式' : '切换到浅色模式'}
      title={next === 'dark' ? '暗色模式' : '浅色模式'}
    >
      <span className="toolbar-btn-icon" aria-hidden="true">
        {theme === 'dark' ? '☾' : '☀'}
      </span>
    </button>
  );
}
