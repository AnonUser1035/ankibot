import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Top-level error boundary (phase 7). A render/runtime failure in any one area
 * shows a recoverable message instead of white-screening the whole app — which
 * matters once strangers open the portfolio link.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ankibot crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          The app hit an unexpected error. Your saved progress is safe in this browser —
          reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Reload
        </button>
      </div>
    )
  }
}
