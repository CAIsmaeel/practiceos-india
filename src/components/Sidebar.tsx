import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Users, UserPlus, Briefcase, FileText, ListChecks, Receipt, Menu, X, Settings, ShieldCheck, Calculator, LogOut, Bot, HelpCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/",             label: "Dashboard",       icon: LayoutDashboard },
  { to: "/clients",      label: "Clients",          icon: Users },
  { to: "/leads",        label: "Leads",            icon: UserPlus },
  { to: "/engagements",  label: "Engagements",      icon: Briefcase },
  { to: "/staff",        label: "Staff",            icon: Users },
  { to: "/compliance",   label: "Compliance",       icon: ShieldCheck },
  { to: "/documents",    label: "Documents",        icon: FileText },
  { to: "/fee-estimator",label: "Fee Estimator",    icon: Calculator },
  { to: "/invoices",     label: "Invoices",         icon: Receipt },
  { to: "/tasks",        label: "Tasks",            icon: ListChecks },
  { to: "/support-agent",label: "AI Support Agent", icon: Bot },
];

const systemItems = [
  { to: "/settings", label: "Settings", icon: Settings },
];

function NavLink({ to, label, icon: Icon, active, onClick }: {
  to: string; label: string; icon: any; active: boolean; onClick: () => void;
}) {
  return (
    <Link to={to} onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-primary"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      )}>
      <span className={cn(
        "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary transition-opacity",
        active ? "opacity-100" : "opacity-0",
      )} />
      <Icon size={17} strokeWidth={2} />
      {label}
    </Link>
  );
}

function FirmIcon({ logoUrl, firmName }: { logoUrl?: string | null; firmName: string }) {
  if (logoUrl) return <img src={logoUrl} alt={firmName} className="w-8 h-8 rounded-md object-contain bg-white p-0.5" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />;
  return <div className="w-8 h-8 rounded-md bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold shrink-0">₹</div>;
}

function FirmIconSmall({ logoUrl, firmName }: { logoUrl?: string | null; firmName: string }) {
  if (logoUrl) return <img src={logoUrl} alt={firmName} className="w-7 h-7 rounded-md object-contain bg-white p-0.5" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />;
  return <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm shrink-0">₹</div>;
}

export function Sidebar({ firmName = "CA Practice Manager", onLogout }: { firmName?: string; onLogout?: () => void; }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: s => s.location.pathname });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("settings").select("firm_name, logo_url").eq("user_id", user?.id ?? "").limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 0,
  });

  const displayFirmName = settings?.firm_name?.trim() || firmName || "CA Practice Manager";
  const logoUrl = settings?.logo_url ?? null;

  const handleRestartTour = () => {
    try { localStorage.removeItem("firmora_tour_step"); } catch {}
    window.location.reload();
  };

  return (
    <>
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between bg-sidebar text-sidebar-foreground px-4 h-14 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 font-semibold min-w-0">
          <FirmIconSmall logoUrl={logoUrl} firmName={displayFirmName} />
          <div className="leading-tight min-w-0">
            <div className="font-semibold text-sidebar-foreground text-sm leading-tight truncate">{displayFirmName}</div>
            <div className="text-[10px] text-sidebar-foreground/50 tracking-wide">Chartered Accountants</div>
          </div>
        </div>
        <button onClick={() => setOpen(!open)} aria-label="Toggle menu" className="text-sidebar-foreground/80 hover:text-sidebar-foreground shrink-0 ml-2">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <aside className={cn(
        "bg-sidebar text-sidebar-foreground w-full border-sidebar-border",
        "md:w-64 md:fixed md:top-0 md:left-0 md:h-screen md:flex md:flex-col md:border-r",
        open ? "block" : "hidden md:flex",
      )}>
        {/* Desktop firm header */}
        <div className="hidden md:flex items-center gap-3 px-4 py-3 border-b border-sidebar-border shrink-0 min-h-[60px]">
          <FirmIcon logoUrl={logoUrl} firmName={displayFirmName} />
          <div className="leading-tight min-w-0 flex-1">
            <div className="font-semibold text-sidebar-foreground text-[14px] leading-tight truncate">{displayFirmName}</div>
            <div className="text-[10px] text-sidebar-foreground/50 tracking-wide uppercase">Chartered Accountants</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 min-h-0">
          {navItems.map(item => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return <NavLink key={item.to} to={item.to} label={item.label} icon={item.icon} active={active} onClick={() => setOpen(false)} />;
          })}
        </nav>

        {/* System + Tour + Logout */}
        <div className="shrink-0 p-2 border-t border-sidebar-border space-y-0.5">
          <p className="px-3 pb-1 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">System</p>
          {systemItems.map(item => {
            const active = pathname.startsWith(item.to);
            return <NavLink key={item.to} to={item.to} label={item.label} icon={item.icon} active={active} onClick={() => setOpen(false)} />;
          })}

          {/* ✅ Take a Tour — no context needed */}
          <button
            onClick={handleRestartTour}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
          >
            <HelpCircle size={17} strokeWidth={2} />
            Take a Tour
          </button>

          {onLogout && (
            <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive-foreground transition-colors">
              <LogOut size={17} strokeWidth={2} />
              Logout
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
