import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './ui'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crash:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="bento max-w-md space-y-3 p-6 text-center">
            <p className="font-display text-xl font-bold">Có lỗi hiển thị</p>
            <p className="text-sm text-muted break-words">{this.state.error.message}</p>
            <Button className="w-full" onClick={() => window.location.assign('/')}>
              Tải lại trang
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
