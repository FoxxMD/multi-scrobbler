// Error boundary for React islands (was @docusaurus/ErrorBoundary)
import React, { Component, type ReactNode } from 'react';

type Fallback = (p: { error: Error; tryAgain: () => void }) => ReactNode;

export default class ErrorBoundary extends Component<{ fallback?: Fallback; children?: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	render() {
		const { error } = this.state;
		if (error) return this.props.fallback?.({ error, tryAgain: () => this.setState({ error: null }) }) ?? null;
		return this.props.children;
	}
}
