"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
    children: ReactNode;
    fallbackTitle?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error(`[ErrorBoundary] ${this.props.fallbackTitle || "Component"} crashed:`, error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/50 p-8 text-center">
                    <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
                    <h3 className="text-lg font-semibold text-white">
                        {this.props.fallbackTitle || "Something went wrong"}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">
                        This section encountered an error. Try refreshing.
                    </p>
                    <button
                        type="button"
                        onClick={this.handleReset}
                        className="mt-4 flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
