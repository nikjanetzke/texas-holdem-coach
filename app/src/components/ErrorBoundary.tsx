import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  error: Error | null;
}

// Catches render/runtime errors so a single thrown exception (e.g. an
// out-of-turn engine action) shows a recoverable screen instead of a blank
// white page that loses the whole session.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Surface it in the console so a recurrence can be diagnosed.
    console.error('Caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center text-slate-200">
          <div className="text-4xl">♠️</div>
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="max-w-md text-sm text-slate-400">
            The table hit an unexpected error. Your progress is saved — you can resume the current game or head back to setup.
          </p>
          <pre className="max-w-md overflow-auto rounded bg-slate-900 p-2 text-left text-[11px] text-rose-300">
            {this.state.error.message}
          </pre>
          <div className="flex gap-3">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded bg-emerald-600 px-4 py-2 font-semibold hover:bg-emerald-500"
            >
              Resume game
            </button>
            <button
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset();
              }}
              className="rounded bg-slate-700 px-4 py-2 font-semibold hover:bg-slate-600"
            >
              Back to setup
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
