import { Component } from 'react';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[App crashed]', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (typeof fallback === 'function') {
        return fallback(error, this.handleReset);
      }
      if (fallback) {
        return fallback;
      }

      return (
        <div className="error-container app-error-boundary" role="alert">
          <p>页面出错了</p>
          <p className="error-text">{error.message}</p>
          <button type="button" className="btn-primary" onClick={this.handleReset}>
            重试
          </button>
        </div>
      );
    }

    return children;
  }
}

export default AppErrorBoundary;
