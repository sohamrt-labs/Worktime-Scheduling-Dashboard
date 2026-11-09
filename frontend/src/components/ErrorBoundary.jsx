// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { Component } from "react";

// Catches any rendering crash so users see a friendly message and a Reload button instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-stone-600">The page hit an unexpected error. Your data is safe.</p>
        <button onClick={() => window.location.reload()} className="rounded bg-stone-900 px-4 py-2 text-white">Reload</button>
      </main>
    );
  }
}
