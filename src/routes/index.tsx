import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { Users, Briefcase, MessageCircle, ChevronRight, Bell, ExternalLink, TrendingUp, TrendingDown, Minus, ShieldAlert } from "lucide-react";
import { format, addDays, isBefore, differenceInCalendarDays, differenceInDays, startOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Firmora" }] }),
  component: Dashboard,
});

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

type FocusItem = {
  id: string; priority: "critical" | "attention";
  type: "compliance" | "invoice" | "document" | "lead" | "task" | "dsc" | "engagement";
  clientName: string; description: string; detail: string;
  href: string; action: string; waPhone?: string;
};

type FocusGroup = {
  type: FocusItem["type"];
  priority: "critical" | "attention";
  label: string;
  icon: string;
  items: FocusItem[];
  href: string;
  action: string;
  totalAmount?: string;
};

function TodaysFocus({ items }: { items: FocusItem[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (items.length === 0) return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Today's Focus</h2>
      </div>
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">🎉 Nothing urgent today — you're on top of things!</p>
    </div>
  );

  // Group items by type
  const groupMap: Record<string, FocusGroup> = {};
  items.forEach(item => {
    const key = item.type;
    if (!groupMap[key]) {
      const meta: Record<string, { label: string; icon: string; href: string; action: string }> = {
        dsc:        { label: "DSC Expiry",          icon: "🔐", href: "/clients",     action: "View Clients" },
        invoice:    { label: "Overdue Invoices",     icon: "💰", href: "/invoices",    action: "View Invoices" },
        document:   { label: "Documents Pending",    icon: "📄", href: "/engagements", action: "View Engagements" },
        engagement: { label: "Deadline Missed",      icon: "⏰", href: "/engagements", action: "View Engagements" },
        compliance: { label: "Compliance Overdue",   icon: "⚠️", href: "/compliance",  action: "View Compliance" },
        lead:       { label: "Hot Leads",            icon: "🔥", href: "/leads",       action: "View Leads" },
        task:       { label: "Tasks Due",            icon: "✅", href: "/tasks",       action: "View Tasks" },
      };
      groupMap[key] = {
        type: key as FocusItem["type"],
        priority: item.priority,
        label: meta[key]?.label ?? key,
        icon: meta[key]?.icon ?? "📌",
        href: meta[key]?.href ?? "/",
        action: meta[key]?.action ?? "View",
        items: [],
      };
    }
    // Escalate to critical if any item is critical
    if (item.priority === "critical") groupMap[key].priority = "critical";
    groupMap[key].items.push(item);
  });

  const groups = Object.values(groupMap).sort((a, b) => {
    if (a.priority === "critical" && b.priority !== "critical") return -1;
    if (a.priority !== "critical" && b.priority === "critical") return 1;
    return 0;
  });

  const critical = groups.filter(g => g.priority === "critical");
  const attention = groups.filter(g => g.priority === "attention");
  const totalGroups = groups.length;

  const handleWA = (phone: string) => {
    const p = phone.replace(/\D/g, "");
    window.open(p ? `https://wa.me/91${p}` : `https://wa.me/`, "_blank");
  };

  const renderGroup = (group: FocusGroup) => {
    const isOpen = expanded === group.type;
    const count = group.items.length;
    const previewNames = group.items.slice(0, 3).map(i => i.clientName).join(", ");
    const extra = count > 3 ? ` +${count - 3} more` : "";
    const borderColor = group.priority === "critical" ? "border-red-500 bg-red-50/40" : "border-amber-400 bg-amber-50/30";

    return (
      <div key={group.type} className={`border-l-4 ${borderColor}`}>
        {/* Group Header */}
        <div
          className="flex items-center justify-between py-3 px-4 gap-3 cursor-pointer hover:bg-black/5"
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
            <span className="text-muted-foreground text-xs">{isOpen ? "▲" : "▼"}</span>
          </div>
        </div>

        {/* Expanded individual items */}
        {isOpen && (
          <div className="border-t border-border/50 divide-y divide-border/40">
            {group.items.map(item => (
              <div key={item.id} className="flex items-center justify-between py-2.5 px-6 gap-3 bg-background/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.clientName}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                {item.waPhone && (
                  <button
                    onClick={() => handleWA(item.waPhone!)}
                    className="inline-flex items-center gap-1 text-xs text-green-700 border border-green-200 px-2 py-1 rounded-md font-medium hover:bg-green-100 shrink-0"
                  >
                    <MessageCircle size={11} /> Chase
                  </button>
                )}
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
        <p className="text-xs text-muted-foreground mt-0.5">{totalGroups} area{totalGroups > 1 ? "s" : ""} need your attention</p>
      </div>
      <div className="divide-y divide-border">
        {critical.length > 0 && (
          <div className="px-4 py-2 bg-red-50/30">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">🔴 Critical</p>
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

function ComplianceSection({ items, overdueCount }: { items: any[]; overdueCount: number }) {
  const groups: Record<string, { items: any[]; earliest: string; isOverdue: boolean }> = {};
  items.forEach((item: any) => {
    const key = `${item.complianceType}__${item.dueDate}__${item.isOverdue}`;
    if (!groups[key]) groups[key] = { items: [], earliest: item.dueDate, isOverdue: item.isOverdue };
    groups[key].items.push(item);
  });
  const groupList = Object.values(groups).sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.earliest < b.earliest ? -1 : 1;
  });
  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-foreground">Compliance — Overdue & Next 7 Days</h2>
          {overdueCount > 0 && <p className="text-xs text-red-600 font-medium mt-0.5">⚠ {overdueCount} overdue item{overdueCount > 1 ? "s" : ""}</p>}
        </div>
        <a href="/compliance" className="text-primary text-sm hover:underline font-medium">View All →</a>
      </div>
      <div className="divide-y divide-border">
        {groupList.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No upcoming or overdue compliance items.</p>}
        {groupList.map((group, idx) => {
          const dueDate = group.earliest ? new Date(group.earliest) : null;
          const daysRemaining = dueDate ? differenceInCalendarDays(startOfDay(dueDate), startOfDay(new Date())) : 0;
          const clientNames = group.items.map((i: any) => i.clientName);
          const displayNames = clientNames.slice(0, 3).join(", ");
          const extra = clientNames.length > 3 ? ` +${clientNames.length - 3} more` : "";
          const compType = group.items[0].complianceType;
          let dueLabel = "", labelClass = "", rowClass = "";
          if (group.isOverdue) {
            const daysOverdue = Math.abs(daysRemaining);
            dueLabel = daysOverdue === 0 ? "Due today" : `${daysOverdue}d overdue`;
            labelClass = "bg-red-100 text-red-700"; rowClass = "bg-red-50/60 border-l-4 border-red-500";
          } else {
            dueLabel = daysRemaining === 0 ? "Due today" : daysRemaining === 1 ? "Due tomorrow" : `Due in ${daysRemaining}d`;
            labelClass = daysRemaining <= 1 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
            rowClass = daysRemaining <= 1 ? "bg-red-50/60 border-l-4 border-red-400" : "bg-amber-50/60 border-l-4 border-amber-300";
          }
          return (
            <div key={idx} className={`flex items-center justify-between py-3 px-4 ${rowClass}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground text-sm">{compType}</p>
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">{group.items.length} client{group.items.length > 1 ? "s" : ""}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{displayNames}{extra}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelClass}`}>{dueLabel}</span>
                <span className="text-sm font-medium text-foreground">{dueDate ? format(dueDate, "dd MMM") : "—"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-primary" />
          <div>
            <h2 className="font-semibold text-foreground">Regulatory Updates</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Latest CA-relevant notifications — auto-updated weekly</p>
          </div>
        </div>
      </div>
      <div className="divide-y divide-border">
        {isLoading && <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading updates...</p>}
        {!isLoading && (updates ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No regulatory updates yet.</p>}
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
                      {update.action_required && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">ACTION REQUIRED</span>}
                    </div>
                    <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{update.title}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{pubDate}</span>
                      {deadline && <span className="text-xs font-medium text-red-600">📅 Deadline: {deadline}</span>}
                    </div>
                  </div>
                </div>
                {update.url && (
                  <a href={update.url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-1">
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

function Dashboard() {
  const now = new Date();
  const today = startOfDay(now);
  const in7days = addDays(today, 7);
  const thisMonthStart = startOfMonth(now).toISOString();
  const thisMonthEnd = endOfMonth(now).toISOString();
  const lastMonthStart = startOfMonth(subMonths(now, 1)).toISOString();
  const lastMonthEnd = endOfMonth(subMonths(now, 1)).toISOString();

  const calcPct = (curr: number, prev: number) => {
    if (prev === 0 && curr === 0) return 0;
    if (prev === 0) return 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

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

  const { data: complianceItems } = useQuery({
    queryKey: ["dashboard-compliance"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const todayStr = format(today, "yyyy-MM-dd");
        const next7Str = format(in7days, "yyyy-MM-dd");
        const { data: overdueData } = await supabase.from("compliance_items")
          .select("id, compliance_type, due_date, status, client_id, clients!inner(name, status)")
          .eq("user_id", userId ?? "").eq("status", "pending")
          .neq("clients.status", "deleted").neq("clients.status", "archived")
          .lt("due_date", todayStr).order("due_date", { ascending: true }).limit(20);
        const { data: upcomingData } = await supabase.from("compliance_items")
          .select("id, compliance_type, due_date, status, client_id, clients!inner(name, status)")
          .eq("user_id", userId ?? "").eq("status", "pending")
          .neq("clients.status", "deleted").neq("clients.status", "archived")
          .gte("due_date", todayStr).lte("due_date", next7Str).order("due_date", { ascending: true });
        const mapItem = (item: any, isOverdue: boolean) => ({
          id: item.id, clientName: item.clients?.name ?? "—",
          complianceType: item.compliance_type ?? "—", dueDate: item.due_date, isOverdue,
        });
        return [
          ...(overdueData ?? []).map((i: any) => mapItem(i, true)),
          ...(upcomingData ?? []).map((i: any) => mapItem(i, false)),
        ];
      } catch { return []; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // ✅ DSC expiry — expired or expiring in 7 days
  const { data: dscClients } = useQuery({
    queryKey: ["dashboard-dsc"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const in7Str = format(in7days, "yyyy-MM-dd");
        const { data } = await supabase.from("clients")
          .select("id, name, phone, dsc_expiry_date")
          .eq("user_id", userId ?? "")
          .not("status", "in", '("deleted","archived")')
          .not("dsc_expiry_date", "is", null)
          .lte("dsc_expiry_date", in7Str)
          .order("dsc_expiry_date", { ascending: true });
        return (data ?? []) as any[];
      } catch { return []; }
    },
    refetchInterval: 60000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // ✅ Pending mandatory docs — engagements blocked
  const { data: pendingDocs } = useQuery({
    queryKey: ["dashboard-pending-docs-focus"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { data } = await supabase.from("engagement_documents")
          .select("engagement_id, requirement, engagements!inner(id, title, status, client_id, clients!inner(name, phone, status))")
          .eq("user_id", userId ?? "")
          .eq("status", "pending")
          .eq("requirement", "mandatory")
          .neq("engagements.status", "completed")
          .neq("engagements.status", "billed")
          .neq("engagements.clients.status", "deleted")
          .neq("engagements.clients.status", "archived");
        return (data ?? []) as any[];
      } catch { return []; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const isActiveEng = (e: any) => e.status !== "completed" && e.status !== "billed";
  const activeCount = engagements?.filter(isActiveEng).length ?? 0;
  const overdueEngagements = engagements?.filter((e: any) => e.deadline && isBefore(new Date(e.deadline), now) && isActiveEng(e)).length ?? 0;
  const overdueComplianceCount = complianceItems?.filter((i: any) => i.isOverdue).length ?? 0;

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
  const fmtINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  // ✅ Build Today's Focus items
  const todaysFocus: FocusItem[] = [];

  // 1. DSC expired or expiring in 7 days
  (dscClients ?? []).slice(0, 3).forEach((client: any) => {
    const expiry = new Date(client.dsc_expiry_date);
    const daysLeft = differenceInCalendarDays(startOfDay(expiry), today);
    const isExpired = daysLeft < 0;
    const label = isExpired
      ? `DSC expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""} ago`
      : daysLeft === 0
        ? "DSC expires today"
        : `DSC expiring in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
    todaysFocus.push({
      id: `dsc-${client.id}`,
      priority: isExpired || daysLeft <= 2 ? "critical" : "attention",
      type: "dsc",
      clientName: client.name,
      description: `${label} — renewal needed`,
      detail: "DSC",
      href: "/clients",
      action: "View Client",
      waPhone: client.phone ?? "",
    });
  });

  // 2. Overdue invoices
  (invoices ?? []).filter((inv: any) => {
    if (!inv.due_date || (inv.status ?? "").toLowerCase() === "paid") return false;
    return new Date(inv.due_date) < now;
  }).slice(0, 2).forEach((inv: any) => {
    const days = differenceInDays(now, new Date(inv.due_date));
    const amt = fmtINR(Number(inv.total_amount ?? inv.amount ?? 0));
    todaysFocus.push({
      id: `inv-${inv.id}`,
      priority: days > 30 ? "critical" : "attention",
      type: "invoice",
      clientName: inv.clients?.name ?? "—",
      description: `${amt} overdue by ${days} day${days !== 1 ? "s" : ""}`,
      detail: "Invoice",
      href: "/invoices",
      action: "Open Invoice",
      waPhone: inv.clients?.phone ?? "",
    });
  });

  // 3. Mandatory docs blocking engagements
  const blockedEngMap: Record<string, { clientName: string; title: string; count: number; phone: string; engId: string }> = {};
  (pendingDocs ?? []).forEach((doc: any) => {
    const eng = doc.engagements;
    const client = eng?.clients;
    const key = eng?.id;
    if (!key) return;
    if (!blockedEngMap[key]) {
      blockedEngMap[key] = {
        clientName: client?.name ?? "—",
        title: eng?.title ?? "Engagement",
        count: 0,
        phone: client?.phone ?? "",
        engId: key,
      };
    }
    blockedEngMap[key].count += 1;
  });
  Object.values(blockedEngMap).slice(0, 3).forEach((eng) => {
    todaysFocus.push({
      id: `doc-${eng.engId}`,
      priority: "attention",
      type: "document",
      clientName: eng.clientName,
      description: `${eng.count} mandatory doc${eng.count > 1 ? "s" : ""} pending — blocking "${eng.title}"`,
      detail: "Documents",
      href: "/engagements",
      action: "View",
      waPhone: eng.phone,
    });
  });

  // 4. Overdue engagements deadline
  (engagements ?? [])
    .filter((e: any) => e.deadline && isBefore(new Date(e.deadline), now) && isActiveEng(e))
    .slice(0, 2)
    .forEach((e: any) => {
      const daysOver = differenceInDays(now, new Date(e.deadline));
      todaysFocus.push({
        id: `eng-${e.id}`,
        priority: daysOver > 7 ? "critical" : "attention",
        type: "engagement",
        clientName: e.clients?.name ?? "—",
        description: `"${e.title}" deadline passed ${daysOver} day${daysOver !== 1 ? "s" : ""} ago`,
        detail: "Engagement",
        href: "/engagements",
        action: "Review",
        waPhone: e.clients?.phone ?? e.clients?.whatsapp_number ?? "",
      });
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your practice — {format(now, "EEEE, dd MMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={clients ?? 0} icon={Users} color="bg-primary" href="/clients"
          trend={clientsThisMonth !== undefined && clientsLastMonth !== undefined && clientsLastMonth > 0
            ? { pct: clientsPct, label: "vs last month" } : undefined}
          sub={clientsLastMonth === 0 || clientsLastMonth === undefined ? `+${clientsThisMonth ?? 0} this month` : undefined}
        />
        <StatCard label="Fees Collected" value={fmtINR(collectedThisMonth)}
          sub={`Outstanding: ${fmtINR(totalOutstanding)}`}
          icon={Briefcase} color="bg-green-600" href="/invoices"
          trend={collectedLastMonth > 0 ? { pct: feesPct, label: "vs last month" } : undefined}
        />
        <StatCard label="Open Leads" value={openLeadsCount ?? 0} icon={Users} color="bg-purple-500" href="/leads" />
        <StatCard label="Active Engagements" value={activeCount} icon={Briefcase} color="bg-indigo-500" href="/engagements"
          sub={overdueEngagements > 0 ? `${overdueEngagements} deadline missed` : undefined}
        />
      </div>

      <TodaysFocus items={todaysFocus.slice(0, 7)} />
      <ComplianceSection items={complianceItems ?? []} overdueCount={overdueComplianceCount} />
      <RegulatoryUpdates />
    </div>
  );
}
