import { Component, type ReactNode, type ErrorInfo } from 'react';
import { useStatus } from './hooks/useStatus';
import { MonitorColumn } from './components/MonitorColumn';
import { ControlColumn } from './components/ControlColumn';
import './App.css';

interface ErrorBoundaryProps {
  label: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  message: string | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { message: null };

  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    const message = err instanceof Error ? err.message : String(err);
    return { message };
  }

  componentDidCatch(err: unknown, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label}] render error`, err, info);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="app-error mono" role="alert">
          {this.props.label} crashed: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const { status, error, refresh } = useStatus();

  return (
    <div className="app-shell">
      {error && <div className="app-error" role="alert">{error}</div>}
      <main className="app-grid">
        <ErrorBoundary label="Monitor">
          <MonitorColumn status={status} />
        </ErrorBoundary>
        <ErrorBoundary label="Controls">
          <ControlColumn status={status} onRefresh={refresh} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
