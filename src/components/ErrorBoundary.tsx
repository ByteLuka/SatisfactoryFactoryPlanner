import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error);
      return (
        <div className="min-h-screen bg-[#1a1a1f] flex items-center justify-center p-8">
          <div className="bg-red-950/50 border border-red-800 rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-red-400 text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-red-300/80 text-sm font-mono">{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
