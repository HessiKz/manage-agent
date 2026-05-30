"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { clientLog } from "@/lib/logger";
import { ErrorFallback } from "./error-fallback";

type Props = {
  children: ReactNode;
  /** Optional segment label for logs */
  segment?: string;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    clientLog("error", error.message, {
      event: "react.boundary",
      error,
      context: {
        segment: this.props.segment,
        componentStack: info.componentStack?.slice(0, 2000),
      },
    });
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleReset}
          segment={this.props.segment}
        />
      );
    }
    return this.props.children;
  }
}
