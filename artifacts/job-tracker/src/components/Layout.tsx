import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Plus, User, Menu, X, Briefcase, Search, LogOut, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/hooks/use-theme";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Find Jobs", href: "/jobs", icon: Search },
  { label: "Add Application", href: "/applications/new", icon: Plus },
  { label: "Profile", href: "/profile", icon: User },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-screen bg-background" data-testid="layout">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-sidebar-border">
          <Briefcase className="text-primary" size={20} />
          <span className="font-semibold text-sidebar-foreground tracking-tight">JobTrack</span>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href}>
                <button
                  data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3 space-y-2">
          {user && (
            <div className="flex items-center gap-2 px-1 text-sm text-sidebar-foreground truncate">
              <User size={15} className="shrink-0" />
              <span className="truncate" data-testid="text-username">{user.username}</span>
            </div>
          )}
          <button
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            onClick={logout}
            data-testid="button-logout"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Briefcase className="text-primary" size={18} />
          <span className="font-semibold text-sidebar-foreground">JobTrack</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            data-testid="button-theme-toggle-mobile"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-20 bg-black/40" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute left-0 top-0 h-full w-56 bg-sidebar border-r border-sidebar-border pt-14 px-2 py-3 space-y-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = location === href;
              return (
                <Link key={href} href={href}>
                  <button
                    onClick={() => setMobileOpen(false)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    }`}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                </Link>
              );
            })}
            <button
              onClick={() => {
                setMobileOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
