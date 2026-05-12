import { useStatus } from './hooks/useStatus';
import { MonitorColumn } from './components/MonitorColumn';
import { ControlColumn } from './components/ControlColumn';
import './App.css';

export function App() {
  const { status, error, refresh } = useStatus();

  return (
    <div className="app-shell">
      <header className="app-header">
        <img className="app-mark" src="/skull.svg" alt="" aria-hidden="true" />
        <div className="app-wordmark">
          <span>RADIO</span>
          <span>CONTROL</span>
        </div>
        {error && <div className="app-error" role="alert">{error}</div>}
      </header>
      <main className="app-grid">
        <MonitorColumn status={status} />
        <ControlColumn status={status} onAction={refresh} />
      </main>
    </div>
  );
}
