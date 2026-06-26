import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  message: string;
  stack: string;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    message: '',
    stack: '',
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      message: error.message || '页面渲染失败',
      stack: error.stack || '',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[app-error-boundary]', error, errorInfo);
  }

  render() {
    if (!this.state.message) {
      return this.props.children;
    }

    return (
      <main className="app-error-boundary">
        <section>
          <span>Runtime Error</span>
          <h1>页面渲染失败</h1>
          <p>{this.state.message}</p>
          {this.state.stack ? <pre>{this.state.stack}</pre> : null}
          <button type="button" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
