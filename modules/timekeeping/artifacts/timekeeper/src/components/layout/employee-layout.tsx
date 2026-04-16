import { Link, useLocation } from "wouter";
import { Clock, UserCircle, ArrowLeftRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

export function EmployeeLayout({ children, employeeName }: { children: React.ReactNode, employeeName?: string }) {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between mx-auto px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Clock className="h-6 w-6 text-primary" />
            <span className="tracking-tight">Timekeeper</span>
          </div>
          <div className="flex items-center gap-4">
            {employeeName && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <UserCircle className="h-4 w-4" />
                {employeeName}
              </div>
            )}
            <Link href="/employee">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                <span className="hidden sm:inline">Switch User</span>
              </Button>
            </Link>
            {user && (
              <Button variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Log Out</span>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
