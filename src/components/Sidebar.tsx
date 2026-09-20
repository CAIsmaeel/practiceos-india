import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
// @ts-ignore - lucide-react does not currently ship TypeScript declarations in this setup
import { LayoutDashboard, Users, UserPlus, Briefcase, FileText, ListChecks, Receipt, Menu, X, Settings, Activity, ShieldCheck, Calculator, LogOut } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

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
      <div className="md:hidden flex items-center justify-between bg-slate-800 text-white px-4 h-14">
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-blue-400">₹</span>
          <div className="leading-tight">
            <div className="font-bold text-white text-base leading-tight">{displayFirmName}</div>
            <div className="text-[10px] text-slate-400">Chartered Accountants</div>
          </div>
        </div>
        <button onClick={() => setOpen(!open)} aria-label="Toggle menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } md:block bg-slate-800 text-slate-100 w-full md:w-64 md:min-h-screen md:fixed md:top-0 md:left-0 md:flex md:flex-col`}
      >
        {/* Desktop header */}
        <div className="hidden md:flex items-center gap-3 px-6 h-16 border-b border-slate-700">
          <div className="w-8 h-8 rounded-md bg-blue-500 flex items-center justify-center text-white font-bold">
            ₹
          </div>
          <div className="leading-tight">
            <div className="font-bold text-white text-base leading-tight">{displayFirmName}</div>
            <div className="text-[10px] text-slate-400">Chartered Accountants</div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="p-3 space-y-1 flex-1">
          {navItems.map((item) => {
            const active =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-500 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* System items + Logout */}
        <div className="p-3 border-t border-slate-700 space-y-1">
          <p className="px-3 pb-1 text-xs font-medium text-slate-500 uppercase tracking-wider">
            System
          </p>
          {systemItems.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-blue-500 text-white"
                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}

          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:bg-red-600 hover:text-white transition-colors"
            >
              <LogOut size={18} />
              Logout
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
