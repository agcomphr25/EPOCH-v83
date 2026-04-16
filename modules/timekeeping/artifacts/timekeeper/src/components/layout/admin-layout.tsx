import { Link, useLocation } from "wouter";
import { Users, Clock, Settings, FileText, LayoutDashboard, Menu, LogOut, Tag, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Employees", icon: Users },
  { href: "/admin/timesheets", label: "Timesheets", icon: FileText },
  { href: "/admin/punches", label: "Punches", icon: Clock },
  { href: "/admin/floor-check", label: "Floor Check", icon: ClipboardCheck },
  { href: "/admin/cost-codes", label: "Cost Codes", icon: Tag },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();

  const NavLinks = () => (
    <>
      {NAV_ITEMS.map((item) => (
        <Link key={item.href} href={item.href}>
          <div
            className={`nav-slide flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground ${
              location === item.href || (item.href !== "/admin" && location.startsWith(item.href))
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                : "text-muted-foreground"
            }`}
            onClick={() => setMobileOpen(false)}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </div>
        </Link>
      ))}
    </>
  );

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[220px_1fr] lg:grid-cols-[280px_1fr]">
      <div className="hidden border-r bg-sidebar md:block">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Clock className="h-6 w-6 text-primary" />
              <span className="text-sidebar-foreground tracking-tight">Timekeeper Admin</span>
            </Link>
          </div>
          <div className="flex-1 overflow-auto">
            <nav className="grid items-start px-2 text-sm font-medium lg:px-4 py-4 gap-1">
              <NavLinks />
            </nav>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 md:hidden"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col">
              <div className="flex h-14 items-center border-b px-4 font-semibold">
                <Clock className="h-5 w-5 mr-2 text-primary" />
                Timekeeper Admin
              </div>
              <nav className="grid gap-2 text-lg font-medium p-4">
                <NavLinks />
              </nav>
            </SheetContent>
          </Sheet>
          <div className="w-full flex-1">
            {/* Header stuff could go here */}
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <span className="hidden sm:block text-xs text-muted-foreground">{user.email}</span>
            )}
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => logout()}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-8 bg-muted/20">
          {children}
        </main>
      </div>
    </div>
  );
}
