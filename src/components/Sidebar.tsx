import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
// @ts-ignore - lucide-react does not currently ship TypeScript declarations in this setup
import { LayoutDashboard, Users, UserPlus, Briefcase, FileText, ListChecks, Receipt, Menu, X, Settings, Activity, ShieldCheck, Calculator, LogOut } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/leads", label: "Leads", icon: UserPlus },
  { to: "/engagements", label: "Engagements", icon: Briefcase },
  { to: "/compliance", label: "Compliance", icon: ShieldCheck },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/fee-estimator", label: "Fee Estimator", icon: Calculator },
  { to: "/invoices", label: "Invoices", icon: Receipt },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
];

const systemItems = [
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLink({
  to,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  to: string;
  label: string;
  icon: any;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon size={17} strokeWidth={2} />
      {label}
    </Link>
  );
}

export function Sidebar({
  firmName = "CA Practice Manager",
  onLogout,
}: {
  firmName?: string;
  onLogout?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("settings")
        .select("firm_name")
        .eq("user_id", user?.id ?? "")
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 0,
  });

  const displayFirmName =
    settings?.firm_name?.trim() || firmName || "CA Practice Manager";

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between bg-sidebar text-sidebar-foreground px-4 h-14 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 font-semibold">
          <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm">
            ₹
          </div>
          <div className="leading-tight">
            <div className="font-display font-semibold text-sidebar-foreground text-sm leading-tight">{displayFirmName}</div>
            <div className="text-[10px] text-sidebar-foreground/50 tracking-wide">Chartered Accountants</div>
          </div>
        </div>
        <button
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          className="text-sidebar-foreground/80 hover:text-sidebar-foreground"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } md:block bg-sidebar text-sidebar-foreground w-full md:w-64 md:min-h-screen md:fixed md:top-0 md:left-0 md:flex md:flex-col md:border-r md:border-sidebar-border`}
      >
        {/* Desktop header */}
        <div className="hidden md:flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold">
            ₹
          </div>
          <div className="leading-tight">
            <div className="font-display font-semibold text-sidebar-foreground text-[15px] leading-tight">{displayFirmName}</div>
            <div className="text-[10px] text-sidebar-foreground/50 tracking-wide uppercase">Chartered Accountants</div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="p-3 space-y-0.5 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const active =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                active={active}
                onClick={() => setOpen(false)}
              />
            );
          })}
        </nav>

        {/* System items + Logout */}
        <div className="p-3 border-t border-sidebar-border space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
            System
          </p>
          {systemItems.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                active={active}
                onClick={() => setOpen(false)}
              />
            );
          })}

          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive-foreground transition-colors"
            >
              <LogOut size={17} strokeWidth={2} />
              Logout
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
