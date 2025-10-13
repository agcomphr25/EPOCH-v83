import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error to console and store details
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error details:', errorInfo);
    
    // Store global error for debugging
    if ((window as any).getGlobalErrors) {
      const globalErrors = (window as any).getGlobalErrors();
      globalErrors.push({
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        type: 'ErrorBoundary'
      });
    }

    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl w-full">
            <div className="flex items-center mb-4">
              <div className="bg-red-100 rounded-full p-2 mr-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-red-600">Application Error</h1>
            </div>
            
            <p className="text-gray-700 mb-4">
              An unexpected error occurred while loading the EPOCH v8 Manufacturing ERP system.
            </p>

            <div className="bg-gray-100 rounded p-4 mb-4">
              <h3 className="font-semibold text-gray-800 mb-2">Error Details:</h3>
              <p className="text-red-600 font-mono text-sm mb-2">
                {this.state.error?.message}
              </p>
              {this.state.error?.stack && (
                <details className="text-xs text-gray-600">
                  <summary className="cursor-pointer font-medium">Stack Trace</summary>
                  <pre className="mt-2 overflow-auto max-h-48 bg-white p-2 rounded border">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>

            {this.state.errorInfo?.componentStack && (
              <div className="bg-gray-100 rounded p-4 mb-4">
                <h3 className="font-semibold text-gray-800 mb-2">Component Stack:</h3>
                <pre className="text-xs text-gray-600 overflow-auto max-h-32 bg-white p-2 rounded border">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button 
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                onClick={() => window.location.reload()}
              >
                Reload Application
              </button>
              
              <button 
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
                onClick={() => window.location.href = '/health.html'}
              >
                Health Check
              </button>
              
              <button 
                className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 transition-colors"
                onClick={() => window.location.href = '/debug.html'}
              >
                Debug Information
              </button>

              <button 
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                }}
              >
                Try Again
              </button>
            </div>

            <div className="mt-4 text-sm text-gray-500">
              <p>If this error persists, please check:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Browser console for additional error messages</li>
                <li>Network connectivity to the server</li>
                <li>Database connection status</li>
                <li>JavaScript compatibility with your browser</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;