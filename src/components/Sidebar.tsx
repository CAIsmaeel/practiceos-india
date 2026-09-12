import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserPlus, Briefcase, FileText, ListChecks, Menu, X } from "lucide-react";
import { useState } from "react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/leads", label: "Leads", icon: UserPlus },
  { to: "/engagements", label: "Engagements", icon: Briefcase },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
];

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between bg-slate-800 text-white px-4 h-14">
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-blue-400">₹</span> PracticeOS
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
        <div className="hidden md:flex items-center gap-2 px-6 h-16 border-b border-slate-700">
          <div className="w-8 h-8 rounded-md bg-blue-500 flex items-center justify-center text-white font-bold">
            ₹
          </div>
          <div>
            <div className="font-semibold leading-tight">PracticeOS</div>
            <div className="text-xs text-slate-400">CA Practice Manager</div>
          </div>
        </div>
        <nav className="p-3 space-y-1">
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
      </aside>
    </>
  );
}
