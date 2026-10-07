const LoadErrorBanner = ({ message, onRetry }) => (
  <div className="wiki-error-banner" role="alert">
    <span>加载失败：{message}</span>
    <button type="button" className="wiki-error-retry" onClick={onRetry}>
      重试
    </button>
  </div>
);

export default LoadErrorBanner;
