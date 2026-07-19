import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  onError?: (message: string) => void;
  fallback?: ReactNode;
};

type State = {
  message: string | null;
};

/** Isolates timeline chart failures from the rest of the sample detail page. */
export class TimelineErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || "Unknown chart render error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error.message);
    console.error("Boise Workbench timeline render error:", error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        this.props.fallback ?? (
          <p style={{ marginTop: 16, fontSize: 12, color: "#ef9a9a" }}>
            Timeline unavailable: {this.state.message}
          </p>
        )
      );
    }
    return this.props.children;
  }
}
