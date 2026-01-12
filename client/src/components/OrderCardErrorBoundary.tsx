import { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  orderId?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class OrderCardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`OrderCardErrorBoundary caught error for order ${this.props.orderId}:`, error);
    console.error('Error details:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Error loading order</span>
              {this.props.orderId && (
                <Badge variant="outline" className="ml-2">
                  {this.props.orderId}
                </Badge>
              )}
            </div>
            <p className="text-sm text-red-500 mt-2">
              This order could not be displayed. Please refresh the page or contact support.
            </p>
            {this.state.error?.message && (
              <p className="text-xs text-gray-500 mt-1 font-mono">
                {this.state.error.message}
              </p>
            )}
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

export default OrderCardErrorBoundary;
