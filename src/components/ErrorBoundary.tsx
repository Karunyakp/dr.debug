import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error) {
    console.error('KAIROS ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F1F7F4] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#D5E7DD] rounded-2xl p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-[#0B3B2D] mb-2">KAIROS Interface Recovery</h1>
            <p className="text-sm text-slate-600 mb-6 break-words">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B3B2D] text-white text-sm font-semibold hover:bg-[#07291F] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Platform
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
