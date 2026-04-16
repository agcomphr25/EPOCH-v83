import { Redirect } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import type { ReactNode } from "react";

interface RouteGuardProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function RouteGuard({ children, requireAdmin }: RouteGuardProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (requireAdmin && user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">Access Denied</p>
          <p className="text-sm text-muted-foreground">Admin access is required for this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
