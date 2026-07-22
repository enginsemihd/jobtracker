import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Plus, User, Menu, X, Briefcase, Search, LogOut, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/hooks/use-theme";

const navItems = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Find jobs", href: "/jobs", icon: Search },
  { label: "Add application", href: "/applications/new", icon: Plus },
  { label: "Profile", href: "/profile", icon: User },
];

function NavButton({
  label,
  Icon,
  active,
  onClick,
  testId,
}: {
  label: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
  onClick?: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[14.5px] transition-colors ${
        active
          ? "bg-card text-foreground font-bold shadow-card"
          : "text-muted-foreground font-medium hover:bg-chip"
      }`}
    >
      <Icon size={16} className={active ? "text-ember" : ""} />
      {label}
    </button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-screen bg-background" data-testid="layout">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[240px] bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-ember text-primary-foreground shrink-0">
            <Briefcase size={16} />
          </span>
          <span className="font-display text-[19px] font-bold text-foreground tracking-tight">JobTrack</span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ label, href, icon }) => (
            <Link key={href} href={href}>
              <NavButton
                label={label}
                Icon={icon}
                active={location === href}
                testId={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
              />
            </Link>
          ))}
        </nav>
        <div className="p-3 space-y-1">
          {user && (
            <div className="flex items-center gap-2.5 px-3 py-1.5 text-[13.5px] text-foreground">
              <span className="flex items-center justify-center w-[26px] h-[26px] rounded-full bg-ember-tint text-ember text-xs font-bold shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </span>
              <span className="truncate font-medium" data-testid="text-username">{user.username}</span>
            </div>
          )}
          <button
            onClick={toggleTheme}
            data-testid="button-theme-toggle"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-sm font-medium text-muted-foreground hover:bg-chip transition-colors"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            onClick={logout}
            data-testid="button-logout"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-sm font-medium text-muted-foreground hover:bg-chip transition-colors"
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-[9px] bg-ember text-primary-foreground shrink-0">
            <Briefcase size={15} />
          </span>
          <span className="font-display text-[17px] font-bold text-foreground">JobTrack</span>
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
            className="absolute left-0 top-0 h-full w-[240px] bg-sidebar border-r border-sidebar-border pt-14 px-3 py-3 space-y-1"
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map(({ label, href, icon }) => (
              <Link key={href} href={href}>
                <NavButton
                  label={label}
                  Icon={icon}
                  active={location === href}
                  onClick={() => setMobileOpen(false)}
                  testId={`nav-mobile-${label.toLowerCase().replace(/\s/g, "-")}`}
                />
              </Link>
            ))}
            <button
              onClick={() => {
                setMobileOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-[10px] text-sm font-medium text-muted-foreground hover:bg-chip transition-colors"
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
