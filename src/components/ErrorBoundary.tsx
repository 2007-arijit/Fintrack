import { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Render crash caught by ErrorBoundary:", error, errorInfo);
    this.setState({ info: errorInfo.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md text-left space-y-3">
            <div className="text-destructive font-semibold text-lg">Something crashed</div>
            <div className="text-sm text-foreground break-words whitespace-pre-wrap font-mono bg-secondary/50 p-3 rounded-lg">
              {this.state.error.message}
            </div>
            {this.state.info && (
              <details className="text-xs text-muted-foreground whitespace-pre-wrap">
                <summary className="cursor-pointer">Component stack</summary>
                {this.state.info}
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
