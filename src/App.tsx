import { Routes, Route, Navigate } from 'react-router-dom';
import { GameStateProvider } from './store/GameStateContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Phase1Page } from './components/phase1/Phase1Page';
import { Phase2Placeholder } from './pages/Phase2Placeholder';

export default function App() {
  return (
    <ErrorBoundary>
      <GameStateProvider>
        <Routes>
          <Route path="/" element={<Phase1Page />} />
          <Route path="/phase2" element={<Phase2Placeholder />} />
          {/* TODO Phase 3: add /phase3 route for interactive factory layout renderer */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </GameStateProvider>
    </ErrorBoundary>
  );
}
