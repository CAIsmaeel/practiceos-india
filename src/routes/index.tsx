import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import {
  Users, Briefcase, MessageCircle, ChevronRight, Bell,
  ExternalLink, TrendingUp, TrendingDown, Minus, ArrowRight
} from "lucide-react";
import {
  format, addDays, isBefore, differenceInCalendarDays,
  differenceInDays, startOfDay, startOfMonth, endOfMonth, subMonths
} from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Firmora" }] }),
  component: Dashboard,
});

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub, href, trend }: {
  label: string; value: number | string; icon: any; color: string;
  sub?: string; href?: string; trend?: { pct: number; label: string };
}) {
  const goTo = () => { if (href) window.location.href = href; };
  const TrendIcon = trend ? (trend.pct > 0 ? TrendingUp : trend.pct < 0 ? TrendingDown : Minus) : null;
  const trendColor = trend ? (trend.pct > 0 ? "text-green-600" : trend.pct < 0 ? "text-red-500" : "text-muted-foreground") : "";
  return (
    <div
      role={href ? "link" : undefined} tabIndex={href ? 0 : undefined}
      onClick={href ? goTo : undefined}
      onKeyDown={(e) => { if (href && e.key === "Enter") goTo(); }}
      className={`bg-card border border-border rounded-lg p-5 shadow-sm ${href ? "cursor-pointer hover:shadow-md hover:border-input transition-all" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          {trend && TrendIcon && (
            <div className={`flex items-center gap-1 mt-1 ${trendColor}`}>
              <TrendIcon size={11} />
              <span className="text-[11px] font-medium">{trend.pct > 0 ? "+" : ""}{trend.pct}% {trend.label}</span>
            </div>
          )}
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={22} className="text-primary-foreground" />
        </div>
      </div>
    </div>
  );
}

// ─── Today's Focus ────────────────────────────────────────────────────────────
type FocusItem = {
  id: string; priority: "critical" | "attention";
  type: "compliance" | "invoice" | "document" | "lead" | "task" | "dsc" | "engagement";
  clientName: string; description: string;
  href: string; action: string; waPhone?: string;
};

type FocusGroup = {
  type: string; priority: "critical" | "attention";
  label: string; icon: string; items: FocusItem[];
  href: string; action: string;
};

function TodaysFocus({ items }: { items: FocusItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (items.length === 0) return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Today's Focus</h2>
      </div>
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">🎉 Nothing urgent — you're on top of things!</p>
    </div>
  );

  const META: Record<string, { label: string; icon: string; href: string; action: string }> = {
    dsc:        { label: "DSC Expiry",        icon: "🔐", href: "/clients",     action: "View Clients" },
    invoice:    { label: "Overdue Invoices",   icon: "💰", href: "/invoices",    action: "View Invoices" },
    document:   { label: "Documents Pending",  icon: "📄", href: "/engagements", action: "View Engagements" },
    engagement: { label: "Deadline Missed",    icon: "⏰", href: "/engagements", action: "View Engagements" },
    compliance: { label: "Compliance Overdue", icon: "⚠️", href: "/compliance",  action: "View Compliance" },
    lead:       { label: "Hot Leads",          icon: "🔥", href: "/leads",       action: "View Leads" },
  };

  const groupMap: Record<string, FocusGroup> = {};
  items.forEach(item => {
    if (!groupMap[item.type]) {
      groupMap[item.type] = {
        type: item.type, priority: item.priority,
        label: META[item.type]?.label ?? item.type,
        icon: META[item.type]?.icon ?? "📌",
        href: META[item.type]?.href ?? "/",
        action: META[item.type]?.action ?? "View",
        items: [],
      };
    }
    if (item.priority === "critical") groupMap[item.type].priority = "critical";
    groupMap[item.type].items.push(item);
  });

  const groups = Object.values(groupMap).sort((a, b) =>
    a.priority === "critical" && b.priority !== "critical" ? -1 :
    a.priority !== "critical" && b.priority === "critical" ? 1 : 0
  );

  const critical = groups.filter(g => g.priority === "critical");
  const attention = groups.filter(g => g.priority === "attention");

  const openWA = (phone: string, name: string) => {
    const p = phone.replace(/\D/g, "");
    const msg = encodeURIComponent(`Hi ${name}, this is a reminder regarding your pending compliance. Please get in touch at your earliest convenience.`);
    window.open(p ? `https://wa.me/91${p}?text=${msg}` : `https://wa.me/`, "_blank");
  };

  const renderGroup = (group: FocusGroup) => {
    const isOpen = expanded === group.type;
    const count = group.items.length;
    const previewNames = group.items.slice(0, 3).map(i => i.clientName).join(", ");
    const extra = count > 3 ? ` +${count - 3} more` : "";
    const borderColor = group.priority === "critical"
      ? "border-red-500 bg-red-50/40"
      : "border-amber-400 bg-amber-50/30";

    return (
      <div key={group.type} className={`border-l-4 ${borderColor}`}>
        <div
          className="flex items-center justify-between py-3 px-4 gap-3 cursor-pointer hover:bg-black/5 select-none"
          onClick={() => setExpanded(isOpen ? null : group.type)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base">{group.icon}</span>
              <p className="font-semibold text-foreground text-sm">
                {count} client{count > 1 ? "s" : ""} — {group.label}
              </p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate pl-6">
              {previewNames}{extra}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={group.href}
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs bg-card border border-border text-foreground px-2.5 py-1 rounded-md font-medium hover:bg-muted"
            >
              {group.action} <ChevronRight size={12} />
            </a>
            <span className="text-muted-foreground text-xs w-3">{isOpen ? "▲" : "▼"}</span>
          </div>
        </div>

        {isOpen && (
          <div className="border-t border-border/40 divide-y divide-border/30">
            {group.items.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2.5 px-6 gap-3 bg-background/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.clientName}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.waPhone && (
                    <button
                      onClick={() => openWA(item.waPhone!, item.clientName)}
                      className="inline-flex items-center gap-1 text-xs text-green-700 border border-green-200 px-2 py-1 rounded-md font-medium hover:bg-green-100"
                    >
                      <MessageCircle size={11} /> Chase
                    </button>
                  )}
                  <a
                    href={item.href}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md font-medium hover:bg-muted border border-transparent hover:border-border"
                  >
                    Open <ChevronRight size={11} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Today's Focus</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {groups.length} area{groups.length > 1 ? "s" : ""} need your attention
        </p>
      </div>
      <div className="divide-y divide-border">
        {critical.length > 0 && (
          <div className="px-4 py-2 bg-red-50/30">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">🔴 Critical — Act Now</p>
          </div>
        )}
        {critical.map(renderGroup)}
        {attention.length > 0 && (
          <div className="px-4 py-2 bg-amber-50/30">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">🟠 Needs Attention</p>
          </div>
        )}
        {attention.map(renderGroup)}
      </div>
    </div>
  );
}

// ─── Upcoming Deadlines ───────────────────────────────────────────────────────
function UpcomingDeadlines({ dscClients, engagements, invoices }: {
  dscClients: any[]; engagements: any[]; invoices: any[];
}) {
  const today = startOfDay(new Date());
  const items: { id: string; clientName: string; type: string; description: string; daysLeft: number; href: string; icon: string; urgency: string }[] = [];

  // DSC expiring 8–30 days
  dscClients.forEach((c: any) => {
    const days = differenceInCalendarDays(startOfDay(new Date(c.dsc_expiry_date)), today);
    if (days >= 8 && days <= 30) {
      items.push({
        id: `dsc-${c.id}`, clientName: c.name, type: "DSC",
        description: `DSC expires ${format(new Date(c.dsc_expiry_date), "dd MMM")} — renew soon`,
        daysLeft: days, href: "/clients", icon: "🔐",
        urgency: days <= 14 ? "amber" : "normal",
      });
    }
  });

  // Engagement deadlines 4–15 days away
  engagements
    .filter((e: any) => e.status !== "completed" && e.status !== "billed" && e.deadline)
    .forEach((e: any) => {
      const days = differenceInCalendarDays(startOfDay(new Date(e.deadline)), today);
      if (days >= 4 && days <= 15) {
        items.push({
          id: `eng-${e.id}`, clientName: e.clients?.name ?? "—", type: "Engagement",
          description: `"${e.title}" due ${format(new Date(e.deadline), "dd MMM")}`,
          daysLeft: days, href: "/engagements", icon: "⏰",
          urgency: days <= 7 ? "amber" : "normal",
        });
      }
    });

  // Invoices due 4–10 days
  invoices
    .filter((inv: any) => (inv.status ?? "").toLowerCase() !== "paid" && inv.due_date)
    .forEach((inv: any) => {
      const days = differenceInCalendarDays(startOfDay(new Date(inv.due_date)), today);
      if (days >= 4 && days <= 10) {
        const amt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(inv.total_amount ?? inv.amount ?? 0));
        items.push({
          id: `inv-${inv.id}`, clientName: inv.clients?.name ?? "—", type: "Invoice",
          description: `${amt} due ${format(new Date(inv.due_date), "dd MMM")}`,
          daysLeft: days, href: "/invoices", icon: "💰",
          urgency: days <= 5 ? "amber" : "normal",
        });
      }
    });

  items.sort((a, b) => a.daysLeft - b.daysLeft);
  if (items.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Coming Up</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Next 30 days — plan ahead</p>
      </div>
      <div className="divide-y divide-border">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-3 py-3 px-5">
            <span className="text-lg shrink-0">{item.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground">{item.clientName}</p>
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">{item.type}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                item.urgency === "amber"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-muted text-muted-foreground"
              }`}>
                {item.daysLeft}d left
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent Leads Table ───────────────────────────────────────────────────────
function RecentLeadsTable({ leads }: { leads: any[] }) {
  if (!leads || leads.length === 0) return null;

  const openWA = (phone: string, name: string) => {
    const p = phone?.replace(/\D/g, "") ?? "";
    const msg = encodeURIComponent(`Hi ${name}, thank you for your enquiry. We'd love to connect and understand your requirements better. When would be a good time to speak?`);
    window.open(p ? `https://wa.me/91${p}?text=${msg}` : `https://wa.me/`, "_blank");
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-foreground">Recent Leads</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Open enquiries — respond quickly to convert</p>
        </div>
        <a href="/leads" className="inline-flex items-center gap-1 text-primary text-sm hover:underline font-medium">
          View All <ArrowRight size={13} />
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-left">Name</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-left">Service</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-left">Source</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-left">Score</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-left">Status</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-left">When</th>
              <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-left">Respond</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {leads.map((lead: any) => {
              const daysAgo = lead.created_at ? differenceInDays(new Date(), new Date(lead.created_at)) : null;
              const isNew = daysAgo !== null && daysAgo <= 1;
              return (
                <tr key={lead.id} className={`hover:bg-muted/40 ${isNew ? "bg-green-50/30" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isNew && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">NEW</span>}
                      <span className="font-medium text-foreground">{lead.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[140px] truncate">{lead.requirement ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{lead.source ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      lead.qualification_score === "Hot" ? "bg-red-100 text-red-700" :
                      lead.qualification_score === "Warm" ? "bg-orange-100 text-orange-700" :
                      lead.qualification_score === "Cold" ? "bg-blue-100 text-blue-700" :
                      "bg-muted text-muted-foreground"
                    }`}>{lead.qualification_score ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{lead.status ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {daysAgo === null ? "—" : daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo}d ago`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {lead.phone && (
                        <button
                          onClick={() => openWA(lead.phone, lead.name)}
                          className="inline-flex items-center gap-1 text-xs text-green-700 border border-green-200 px-2 py-1 rounded-md font-medium hover:bg-green-100"
                        >
                          <MessageCircle size={11} /> WA
                        </button>
                      )}
                      <a
                        href="/leads"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-transparent hover:border-border px-2 py-1 rounded-md font-medium hover:bg-muted"
                      >
                        Open <ChevronRight size={11} />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Regulatory Updates ───────────────────────────────────────────────────────
function RegulatoryUpdates() {
  const [showAll, setShowAll] = useState(false);
  const { data: updates, isLoading } = useQuery({
    queryKey: ["regulatory-updates-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_regulatory_events")
        .select("id, title, category, importance, action_required, deadline_date, published_at, url, source")
        .order("published_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const categoryIcon: Record<string, string> = {
    "Direct Tax": "💰", "GST": "🧾", "Corporate Law": "🏢",
    "Audit & Accounting": "📊", "ICAI": "🎓", "Compliance": "📋", "General": "📰",
  };
  const visible = showAll ? (updates ?? []) : (updates ?? []).slice(0, 3);

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Bell size={16} className="text-primary" />
        <div>
          <h2 className="font-semibold text-foreground">Regulatory Updates</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Latest CA-relevant notifications — auto-updated weekly</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {isLoading && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && (updates ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No updates yet.</p>}
        {visible.map((update: any) => {
          const icon = categoryIcon[update.category] ?? "📰";
          const pubDate = update.published_at ? format(new Date(update.published_at), "dd MMM yyyy") : "—";
          const deadline = update.deadline_date ? format(new Date(update.deadline_date), "dd MMM yyyy") : null;
          return (
            <div key={update.id} className="px-5 py-3.5 hover:bg-muted/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] text-muted-foreground font-medium">{update.category}</span>
                      {update.action_required && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">ACTION REQUIRED</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{update.title}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{pubDate}</span>
                      {deadline && <span className="text-xs font-medium text-red-600">📅 Deadline: {deadline}</span>}
                    </div>
                  </div>
                </div>
                {update.url && (
                  <a href={update.url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-1">
                    Read <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
        {(updates ?? []).length > 3 && (
          <div className="px-5 py-3">
            <button onClick={() => setShowAll(p => !p)} className="text-sm text-primary hover:underline font-medium">
              {showAll ? "Show Less ↑" : `Show ${(updates ?? []).length - 3} More ↓`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const now = new Date();
  const today = startOfDay(now);
  const thisMonthStart = startOfMonth(now).toISOString();
  const thisMonthEnd = endOfMonth(now).toISOString();
  const lastMonthStart = startOfMonth(subMonths(now, 1)).toISOString();
  const lastMonthEnd = endOfMonth(subMonths(now, 1)).toISOString();

  const calcPct = (curr: number, prev: number) =>
    prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100);

  const fmtINR = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  // Clients total
  const { data: clients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("user_id", userId ?? "");
      return count ?? 0;
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const { data: clientsThisMonth } = useQuery({
    queryKey: ["clients-this-month"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true })
        .eq("user_id", userId ?? "").gte("created_at", thisMonthStart).lte("created_at", thisMonthEnd);
      return count ?? 0;
    },
    staleTime: 60000,
  });

  const { data: clientsLastMonth } = useQuery({
    queryKey: ["clients-last-month"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true })
        .eq("user_id", userId ?? "").gte("created_at", lastMonthStart).lte("created_at", lastMonthEnd);
      return count ?? 0;
    },
    staleTime: 60000,
  });

  // Engagements
  const { data: engagements } = useQuery({
    queryKey: ["engagements-all"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("engagements")
        .select("*, clients!inner(name, firm_name, status, phone, whatsapp_number)")
        .eq("user_id", userId ?? "")
        .neq("clients.status", "deleted").neq("clients.status", "archived")
        .order("deadline", { ascending: true });
      return data ?? [];
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // Leads
  const { data: openLeadsCount } = useQuery({
    queryKey: ["open-leads-count"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { count } = await supabase.from("leads").select("*", { count: "exact", head: true })
          .eq("user_id", userId ?? "").not("status", "in", '("Converted","Lost","Cold-Closed")');
        return count ?? 0;
      } catch { return 0; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const { data: recentLeads } = useQuery({
    queryKey: ["recent-leads"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { data } = await supabase.from("leads")
          .select("id, name, requirement, qualification_score, phone, source, status, created_at")
          .eq("user_id", userId ?? "")
          .not("status", "in", '("Converted","Lost","Cold-Closed")')
          .order("created_at", { ascending: false }).limit(8);
        return data ?? [];
      } catch { return []; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // Invoices
  const { data: invoices } = useQuery({
    queryKey: ["dashboard-invoices"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("invoices")
        .select("id, amount, total_amount, status, due_date, created_at, payment_date, clients(name, phone)")
        .eq("user_id", userId ?? "").order("due_date", { ascending: true, nullsFirst: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // DSC — expired + expiring in 30 days
  const { data: dscClients } = useQuery({
    queryKey: ["dashboard-dsc"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const in30 = format(addDays(today, 30), "yyyy-MM-dd");
        const { data } = await supabase.from("clients")
          .select("id, name, phone, dsc_expiry_date")
          .eq("user_id", userId ?? "")
          .not("status", "in", '("deleted","archived")')
          .not("dsc_expiry_date", "is", null)
          .lte("dsc_expiry_date", in30)
          .order("dsc_expiry_date", { ascending: true });
        return (data ?? []) as any[];
      } catch { return []; }
    },
    refetchInterval: 60000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // Pending mandatory docs
  const { data: pendingDocs } = useQuery({
    queryKey: ["dashboard-pending-docs-focus"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { data } = await supabase.from("engagement_documents")
          .select("engagement_id, requirement, engagements!inner(id, title, status, client_id, clients!inner(name, phone, status))")
          .eq("user_id", userId ?? "")
          .eq("status", "pending").eq("requirement", "mandatory")
          .neq("engagements.status", "completed").neq("engagements.status", "billed")
          .neq("engagements.clients.status", "deleted").neq("engagements.clients.status", "archived");
        return (data ?? []) as any[];
      } catch { return []; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // Computed values
  const isActiveEng = (e: any) => e.status !== "completed" && e.status !== "billed";
  const activeCount = engagements?.filter(isActiveEng).length ?? 0;
  const overdueEngCount = engagements?.filter((e: any) =>
    e.deadline && isBefore(new Date(e.deadline), now) && isActiveEng(e)
  ).length ?? 0;

  const totalOutstanding = (invoices ?? []).reduce((sum, inv) => {
    if ((inv.status ?? "").toLowerCase() === "paid") return sum;
    return sum + Number(inv.total_amount ?? inv.amount ?? 0);
  }, 0);

  const collectedThisMonth = (invoices ?? []).filter((inv: any) => {
    if ((inv.status ?? "").toLowerCase() !== "paid" || !inv.payment_date) return false;
    return inv.payment_date >= thisMonthStart && inv.payment_date <= thisMonthEnd;
  }).reduce((sum: number, inv: any) => sum + Number(inv.total_amount ?? inv.amount ?? 0), 0);

  const collectedLastMonth = (invoices ?? []).filter((inv: any) => {
    if ((inv.status ?? "").toLowerCase() !== "paid" || !inv.payment_date) return false;
    return inv.payment_date >= lastMonthStart && inv.payment_date <= lastMonthEnd;
  }).reduce((sum: number, inv: any) => sum + Number(inv.total_amount ?? inv.amount ?? 0), 0);

  const feesPct = calcPct(collectedThisMonth, collectedLastMonth);
  const clientsPct = calcPct(clientsThisMonth ?? 0, clientsLastMonth ?? 0);

  // ── Build Today's Focus ────────────────────────────────────────────────────
  const todaysFocus: FocusItem[] = [];

  // 1. DSC expired or expiring ≤7 days
  (dscClients ?? []).forEach((c: any) => {
    const days = differenceInCalendarDays(startOfDay(new Date(c.dsc_expiry_date)), today);
    if (days <= 7) {
      const isExpired = days < 0;
      todaysFocus.push({
        id: `dsc-${c.id}`,
        priority: isExpired || days <= 2 ? "critical" : "attention",
        type: "dsc", clientName: c.name,
        description: isExpired
          ? `DSC expired ${Math.abs(days)}d ago — renewal overdue`
          : days === 0 ? "DSC expires today — renew immediately"
          : `DSC expires in ${days} day${days !== 1 ? "s" : ""} — act now`,
        href: "/clients", action: "View",
        waPhone: c.phone ?? "",
      });
    }
  });

  // 2. Overdue invoices
  (invoices ?? []).filter((inv: any) => {
    if (!inv.due_date || (inv.status ?? "").toLowerCase() === "paid") return false;
    return new Date(inv.due_date) < now;
  }).forEach((inv: any) => {
    const days = differenceInDays(now, new Date(inv.due_date));
    const amt = fmtINR(Number(inv.total_amount ?? inv.amount ?? 0));
    todaysFocus.push({
      id: `inv-${inv.id}`,
      priority: days > 30 ? "critical" : "attention",
      type: "invoice", clientName: inv.clients?.name ?? "—",
      description: `${amt} overdue by ${days} day${days !== 1 ? "s" : ""}`,
      href: "/invoices", action: "Open",
      waPhone: inv.clients?.phone ?? "",
    });
  });

  // 3. Mandatory docs blocking engagements
  const blockedMap: Record<string, { clientName: string; title: string; count: number; phone: string; engId: string }> = {};
  (pendingDocs ?? []).forEach((doc: any) => {
    const eng = doc.engagements;
    const key = eng?.id;
    if (!key) return;
    if (!blockedMap[key]) blockedMap[key] = {
      clientName: eng?.clients?.name ?? "—",
      title: eng?.title ?? "Engagement",
      count: 0, phone: eng?.clients?.phone ?? "", engId: key,
    };
    blockedMap[key].count += 1;
  });
  Object.values(blockedMap).forEach((eng) => {
    todaysFocus.push({
      id: `doc-${eng.engId}`, priority: "attention", type: "document",
      clientName: eng.clientName,
      description: `${eng.count} mandatory doc${eng.count > 1 ? "s" : ""} pending — blocking "${eng.title}"`,
      href: "/engagements", action: "View",
      waPhone: eng.phone,
    });
  });

  // 4. Overdue engagement deadlines
  (engagements ?? [])
    .filter((e: any) => e.deadline && isBefore(new Date(e.deadline), now) && isActiveEng(e))
    .forEach((e: any) => {
      const daysOver = differenceInDays(now, new Date(e.deadline));
      todaysFocus.push({
        id: `eng-${e.id}`,
        priority: daysOver > 7 ? "critical" : "attention",
        type: "engagement", clientName: e.clients?.name ?? "—",
        description: `"${e.title}" deadline passed ${daysOver}d ago`,
        href: "/engagements", action: "Review",
        waPhone: e.clients?.phone ?? e.clients?.whatsapp_number ?? "",
      });
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {format(now, "EEEE, dd MMM yyyy")}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Clients" value={clients ?? 0} icon={Users} color="bg-primary" href="/clients"
          trend={clientsLastMonth && clientsLastMonth > 0 ? { pct: clientsPct, label: "vs last month" } : undefined}
          sub={!clientsLastMonth ? `+${clientsThisMonth ?? 0} this month` : undefined}
        />
        <StatCard
          label="Fees Collected" value={fmtINR(collectedThisMonth)}
          sub={`Outstanding: ${fmtINR(totalOutstanding)}`}
          icon={Briefcase} color="bg-green-600" href="/invoices"
          trend={collectedLastMonth > 0 ? { pct: feesPct, label: "vs last month" } : undefined}
        />
        <StatCard
          label="Open Leads" value={openLeadsCount ?? 0}
          icon={Users} color="bg-purple-500" href="/leads"
        />
        <StatCard
          label="Active Engagements" value={activeCount}
          sub={overdueEngCount > 0 ? `⚠ ${overdueEngCount} deadline missed` : undefined}
          icon={Briefcase} color="bg-indigo-500" href="/engagements"
        />
      </div>

      {/* Today's Focus */}
      <TodaysFocus items={todaysFocus} />

      {/* Coming Up */}
      <UpcomingDeadlines
        dscClients={dscClients ?? []}
        engagements={engagements ?? []}
        invoices={invoices ?? []}
      />

      {/* Recent Leads Table */}
      <RecentLeadsTable leads={recentLeads ?? []} />

      {/* Regulatory Updates */}
      <RegulatoryUpdates />
    </div>
  );
}
