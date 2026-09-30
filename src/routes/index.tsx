import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { Users, Briefcase, Calendar, AlertTriangle, FileText, MessageCircle, ChevronRight, Bell, ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, addDays, isBefore, differenceInCalendarDays, differenceInDays, startOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Firmora" }] }),
  component: Dashboard,
});

// ─── Stat Card with trend ─────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub, href, trend }: {
  label: string; value: number | string; icon: any; color: string;
  sub?: string; href?: string;
  trend?: { pct: number; label: string };
}) {
  const goTo = () => { if (href) window.location.href = href; };
  const TrendIcon = trend ? (trend.pct > 0 ? TrendingUp : trend.pct < 0 ? TrendingDown : Minus) : null;
  const trendColor = trend ? (trend.pct > 0 ? "text-green-600" : trend.pct < 0 ? "text-red-500" : "text-muted-foreground") : "";

  return (
    <div
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
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
              <span className="text-[11px] font-medium">
                {trend.pct > 0 ? "+" : ""}{trend.pct}% {trend.label}
              </span>
            </div>
          )}
          {!trend && sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
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
  type: "compliance" | "invoice" | "document" | "lead" | "task";
  clientName: string; description: string; detail: string;
  href: string; action: string; waPhone?: string;
};

function TodaysFocus({ items }: { items: FocusItem[] }) {
  if (items.length === 0) return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Today's Focus</h2>
      </div>
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">🎉 Nothing urgent today — you're on top of things!</p>
    </div>
  );

  const critical = items.filter(i => i.priority === "critical");
  const attention = items.filter(i => i.priority === "attention");

  const handleWA = (item: FocusItem) => {
    const phone = (item.waPhone ?? "").replace(/\D/g, "");
    window.open(phone ? `https://wa.me/91${phone}` : `https://wa.me/`, "_blank");
  };

  const typeColors: Record<string, string> = {
    compliance: "bg-red-100 text-red-700", invoice: "bg-orange-100 text-orange-700",
    document: "bg-amber-100 text-amber-700", lead: "bg-purple-100 text-purple-700", task: "bg-blue-100 text-blue-700",
  };
  const typeLabels: Record<string, string> = {
    compliance: "Compliance", invoice: "Invoice", document: "Documents", lead: "Lead", task: "Task",
  };

  const renderItem = (item: FocusItem) => (
    <div key={item.id} className={`flex items-center justify-between py-3 px-4 gap-3 ${item.priority === "critical" ? "border-l-4 border-red-500 bg-red-50/40" : "border-l-4 border-amber-400 bg-amber-50/30"}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-foreground text-sm">{item.clientName}</p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${typeColors[item.type]}`}>{typeLabels[item.type]}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.waPhone && (
          <button onClick={() => handleWA(item)} className="inline-flex items-center gap-1 text-xs text-green-700 border border-green-200 px-2.5 py-1 rounded-md font-medium hover:bg-green-100">
            <MessageCircle size={12} /> WA
          </button>
        )}
        <a href={item.href} className="inline-flex items-center gap-1 text-xs bg-card border border-border text-foreground px-2.5 py-1 rounded-md font-medium hover:bg-muted">
          {item.action} <ChevronRight size={12} />
        </a>
      </div>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Today's Focus</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{items.length} item{items.length > 1 ? "s" : ""} need your attention</p>
      </div>
      <div className="divide-y divide-border">
        {critical.length > 0 && <div className="px-4 py-2 bg-red-50/30"><p className="text-xs font-semibold text-red-600 uppercase tracking-wider">🔴 Critical</p></div>}
        {critical.map(renderItem)}
        {attention.length > 0 && <div className="px-4 py-2 bg-amber-50/30"><p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">🟠 Needs Attention</p></div>}
        {attention.map(renderItem)}
      </div>
    </div>
  );
}

// ─── Compliance — Grouped by type ─────────────────────────────────────────────
function ComplianceSection({ items, overdueCount }: { items: any[]; overdueCount: number }) {
  // Group items by compliance_type
  const groups: Record<string, { items: any[]; earliest: string; isOverdue: boolean }> = {};
  items.forEach((item: any) => {
    const key = `${item.complianceType}__${item.dueDate}__${item.isOverdue}`;
    if (!groups[key]) {
      groups[key] = { items: [], earliest: item.dueDate, isOverdue: item.isOverdue };
    }
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
            labelClass = "bg-red-100 text-red-700";
            rowClass = "bg-red-50/60 border-l-4 border-red-500";
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

// ─── Client Activity ──────────────────────────────────────────────────────────
function ClientActivity({ engagements, pendingDocs }: { engagements: any[]; pendingDocs: any[] }) {
  const isActiveEng = (e: any) => e.status !== "completed" && e.status !== "billed";

  // Build per-engagement pending doc count
  const docCountMap: Record<string, number> = {};
  pendingDocs.forEach(d => {
    docCountMap[d.engagement_id] = (docCountMap[d.engagement_id] ?? 0) + 1;
  });

  // Pick engagements with pending docs or overdue deadlines
  const now = new Date();
  const activityItems = engagements
    .filter(isActiveEng)
    .map((e: any) => {
      const pendingCount = docCountMap[e.id] ?? 0;
      const isDeadlineOverdue = e.deadline && isBefore(new Date(e.deadline), now);
      const daysLeft = e.deadline ? differenceInDays(new Date(e.deadline), now) : null;
      return { ...e, pendingCount, isDeadlineOverdue, daysLeft };
    })
    .filter(e => e.pendingCount > 0 || e.isDeadlineOverdue)
    .sort((a, b) => {
      if (a.isDeadlineOverdue && !b.isDeadlineOverdue) return -1;
      if (!a.isDeadlineOverdue && b.isDeadlineOverdue) return 1;
      return b.pendingCount - a.pendingCount;
    })
    .slice(0, 6);

  if (activityItems.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-foreground">Client Activity</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Engagements needing attention</p>
        </div>
        <a href="/engagements" className="text-primary text-sm hover:underline font-medium">View All →</a>
      </div>
      <div className="divide-y divide-border">
        {activityItems.map((e: any) => (
          <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-foreground truncate">{e.clients?.name ?? "—"}</p>
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{e.title}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {e.pendingCount > 0 && (
                  <span className="text-xs text-amber-600 font-medium">📄 {e.pendingCount} doc{e.pendingCount > 1 ? "s" : ""} pending</span>
                )}
                {e.isDeadlineOverdue && (
                  <span className="text-xs text-red-600 font-medium">⏰ Deadline overdue</span>
                )}
                {!e.isDeadlineOverdue && e.daysLeft !== null && e.daysLeft <= 3 && (
                  <span className="text-xs text-orange-500 font-medium">⚡ {e.daysLeft}d left</span>
                )}
              </div>
            </div>
            <a href="/engagements" className="shrink-0 text-xs text-primary hover:underline font-medium">Open →</a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Regulatory Updates ───────────────────────────────────────────────────────
function RegulatoryUpdates() {
  const { data: updates, isLoading } = useQuery({
    queryKey: ["regulatory-updates-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_regulatory_events")
        .select("id, title, category, importance, action_required, deadline_date, published_at, url, source")
        .order("published_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const categoryIcon: Record<string, string> = {
    "Direct Tax": "💰", "GST": "🧾", "Corporate Law": "🏢",
    "Audit & Accounting": "📊", "ICAI": "🎓", "Compliance": "📋", "General": "📰",
  };

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
        {(updates ?? []).map((update: any) => {
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
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const now = new Date();
  const thisMonthStart = startOfMonth(now).toISOString();
  const thisMonthEnd = endOfMonth(now).toISOString();
  const lastMonthStart = startOfMonth(subMonths(now, 1)).toISOString();
  const lastMonthEnd = endOfMonth(subMonths(now, 1)).toISOString();

  const calcPct = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  // Current clients
  const { data: clients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("user_id", userId ?? "");
      return count ?? 0;
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // Clients added this month vs last month
  const { data: clientsThisMonth } = useQuery({
    queryKey: ["clients-this-month"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("user_id", userId ?? "").gte("created_at", thisMonthStart).lte("created_at", thisMonthEnd);
      return count ?? 0;
    },
    staleTime: 60000,
  });

  const { data: clientsLastMonth } = useQuery({
    queryKey: ["clients-last-month"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("user_id", userId ?? "").gte("created_at", lastMonthStart).lte("created_at", lastMonthEnd);
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

  const { data: tasksDueCount } = useQuery({
    queryKey: ["tasks-due-week"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const today = new Date().toISOString().split("T")[0];
        const next7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const { count } = await supabase.from("tasks").select("*", { count: "exact", head: true }).eq("user_id", userId ?? "").gte("due_date", today).lte("due_date", next7).eq("is_complete", false);
        return count ?? 0;
      } catch { return 0; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const { data: openLeadsCount } = useQuery({
    queryKey: ["open-leads-count"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { count } = await supabase.from("leads").select("*", { count: "exact", head: true }).eq("user_id", userId ?? "").not("status", "in", '("Converted","Lost","Cold-Closed")');
        return count ?? 0;
      } catch { return 0; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const { data: pendingChecklistDocs } = useQuery({
    queryKey: ["dashboard-pending-docs"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { data } = await supabase.from("engagement_documents").select("engagement_id, requirement").eq("user_id", userId ?? "").eq("status", "pending");
        return (data ?? []) as { engagement_id: string; requirement: string }[];
      } catch { return []; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  // Invoices — this month
  const { data: invoices } = useQuery({
    queryKey: ["dashboard-invoices"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("invoices")
        .select("id, amount, total_amount, status, due_date, created_at, clients(name, phone)")
        .eq("user_id", userId ?? "")
        .order("due_date", { ascending: true, nullsFirst: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const { data: overdueInvoicesCount } = useQuery({
    queryKey: ["overdue-invoices-count"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const today = new Date();
        const { data } = await supabase.from("invoices").select("id, status, due_date").eq("user_id", userId ?? "").not("status", "eq", "Paid");
        return (data ?? []).filter((inv: any) => {
          if (!inv.due_date || inv.status === "Paid") return false;
          return new Date(inv.due_date) < today;
        }).length;
      } catch { return 0; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const { data: recentLeads } = useQuery({
    queryKey: ["recent-leads"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { data } = await supabase.from("leads").select("id, name, requirement, qualification_score, phone, created_at").eq("user_id", userId ?? "").not("status", "in", '("Converted","Lost","Cold-Closed")').order("created_at", { ascending: false }).limit(5);
        return data ?? [];
      } catch { return []; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const { data: complianceItems } = useQuery({
    queryKey: ["dashboard-compliance"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const today = format(startOfDay(new Date()), "yyyy-MM-dd");
        const next7 = format(startOfDay(addDays(new Date(), 7)), "yyyy-MM-dd");
        const { data: overdueData } = await supabase.from("compliance_items")
          .select("id, compliance_type, due_date, status, client_id, clients!inner(name, status)")
          .eq("user_id", userId ?? "").eq("status", "pending")
          .neq("clients.status", "deleted").neq("clients.status", "archived")
          .lt("due_date", today).order("due_date", { ascending: true }).limit(20);
        const { data: upcomingData } = await supabase.from("compliance_items")
          .select("id, compliance_type, due_date, status, client_id, clients!inner(name, status)")
          .eq("user_id", userId ?? "").eq("status", "pending")
          .neq("clients.status", "deleted").neq("clients.status", "archived")
          .gte("due_date", today).lte("due_date", next7).order("due_date", { ascending: true });
        const mapItem = (item: any, isOverdue: boolean) => ({
          id: item.id,
          clientName: item.clients?.name ?? "—",
          complianceType: item.compliance_type ?? "—",
          dueDate: item.due_date,
          isOverdue,
        });
        return [
          ...(overdueData ?? []).map((i: any) => mapItem(i, true)),
          ...(upcomingData ?? []).map((i: any) => mapItem(i, false)),
        ];
      } catch { return []; }
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const isActiveEng = (e: any) => e.status !== "completed" && e.status !== "billed";
  const activeCount = engagements?.filter(isActiveEng).length ?? 0;
  const overdueEngagements = engagements?.filter((e: any) => e.deadline && isBefore(new Date(e.deadline), now) && isActiveEng(e)).length ?? 0;
  const overdueComplianceCount = complianceItems?.filter((i: any) => i.isOverdue).length ?? 0;
  const overdueCount = overdueEngagements + overdueComplianceCount;

  // Outstanding — this month vs last month
  const totalOutstanding = (invoices ?? []).reduce((sum, inv) => {
    if (inv.status === "Paid") return sum;
    return sum + Number(inv.total_amount ?? inv.amount ?? 0);
  }, 0);

  const collectedThisMonth = (invoices ?? []).filter((inv: any) => {
    if (inv.status !== "Paid") return false;
    return inv.created_at >= thisMonthStart && inv.created_at <= thisMonthEnd;
  }).reduce((sum: number, inv: any) => sum + Number(inv.total_amount ?? inv.amount ?? 0), 0);

  const collectedLastMonth = (invoices ?? []).filter((inv: any) => {
    if (inv.status !== "Paid") return false;
    return inv.created_at >= lastMonthStart && inv.created_at <= lastMonthEnd;
  }).reduce((sum: number, inv: any) => sum + Number(inv.total_amount ?? inv.amount ?? 0), 0);

  const feesPct = calcPct(collectedThisMonth, collectedLastMonth);
  const clientsPct = calcPct(clientsThisMonth ?? 0, clientsLastMonth ?? 0);

  const activeEngClient: Record<string, string> = {};
  (engagements ?? []).forEach((e: any) => { if (isActiveEng(e)) activeEngClient[e.id] = e.client_id; });
  const activePendingDocs = (pendingChecklistDocs ?? []).filter((d) => activeEngClient[d.engagement_id]);
  const clientsWaiting = new Set(activePendingDocs.map((d) => activeEngClient[d.engagement_id])).size;
  const pendingDocsTotal = activePendingDocs.length;
  const mandatoryDocsPending = activePendingDocs.filter((d) => d.requirement === "mandatory").length;

  const todaysFocus: FocusItem[] = [];

  (invoices ?? []).filter((inv: any) => {
    if (!inv.due_date || inv.status === "Paid") return false;
    return new Date(inv.due_date) < now;
  }).slice(0, 2).forEach((inv: any) => {
    const days = differenceInDays(now, new Date(inv.due_date));
    const amt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(inv.total_amount ?? inv.amount ?? 0));
    todaysFocus.push({
      id: `inv-${inv.id}`, priority: days > 30 ? "critical" : "attention", type: "invoice",
      clientName: inv.clients?.name ?? "—", description: `${amt} overdue by ${days} day${days !== 1 ? "s" : ""}`,
      detail: "Invoice", href: "/invoices", action: "Open Invoice", waPhone: inv.clients?.phone ?? "",
    });
  });

  (engagements ?? []).filter(isActiveEng).forEach((e: any) => {
    const blocked = activePendingDocs.filter(d => d.engagement_id === e.id && d.requirement === "mandatory");
    if (blocked.length > 0) {
      todaysFocus.push({
        id: `doc-${e.id}`, priority: "attention", type: "document",
        clientName: e.clients?.name ?? "—",
        description: `${blocked.length} mandatory doc${blocked.length > 1 ? "s" : ""} pending — blocking ${e.title}`,
        detail: "Documents", href: "/engagements", action: "Request",
        waPhone: e.clients?.phone ?? e.clients?.whatsapp_number ?? "",
      });
    }
  });

  (recentLeads ?? []).filter((l: any) => l.qualification_score === "Hot").slice(0, 2).forEach((l: any) => {
    todaysFocus.push({
      id: `lead-${l.id}`, priority: "attention", type: "lead",
      clientName: l.name, description: `Hot lead — ${l.requirement ?? "follow-up needed"}`,
      detail: "Lead", href: "/leads", action: "Follow Up", waPhone: l.phone ?? "",
    });
  });

  const focusItems = todaysFocus.slice(0, 6);
  const fmtINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Overview of your practice — {format(now, "EEEE, dd MMM yyyy")}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={clients ?? 0} icon={Users} color="bg-primary" href="/clients"
          trend={{ pct: clientsPct, label: "vs last month" }} />
        <StatCard label="Fees Collected" value={fmtINR(collectedThisMonth)} icon={Briefcase} color="bg-green-600" href="/invoices"
          trend={{ pct: feesPct, label: "vs last month" }} />
        <StatCard label="Total Outstanding" value={fmtINR(totalOutstanding)} icon={Briefcase} color="bg-indigo-500" href="/invoices" />
        <StatCard label="Active Engagements" value={activeCount} icon={Briefcase} color="bg-indigo-500" href="/engagements" />
        <StatCard label="Tasks Due This Week" value={tasksDueCount ?? 0} icon={Calendar} color="bg-amber-500" href="/tasks" />
        <StatCard label="Overdue Items" value={overdueCount} sub={`${overdueComplianceCount} compliance · ${overdueEngagements} engagements`} icon={AlertTriangle} color="bg-red-500" href="/compliance" />
        <StatCard label="Open Leads" value={openLeadsCount ?? 0} icon={Users} color="bg-purple-500" href="/leads" />
        <StatCard label="Clients Waiting for Docs" value={clientsWaiting} sub={`${pendingDocsTotal} docs · ${mandatoryDocsPending} mandatory`} icon={FileText} color="bg-orange-500" href="/documents" />
      </div>

      {/* Today's Focus */}
      <TodaysFocus items={focusItems} />

      {/* Client Activity */}
      <ClientActivity engagements={engagements ?? []} pendingDocs={pendingChecklistDocs ?? []} />

      {/* Compliance — grouped */}
      <ComplianceSection items={complianceItems ?? []} overdueCount={overdueComplianceCount} />

      {/* Regulatory Updates */}
      <RegulatoryUpdates />

      {/* Recent Leads */}
      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recent Leads</h2>
          <a href="/leads" className="text-primary text-sm hover:underline font-medium">View All →</a>
        </div>
        <div className="divide-y divide-border">
          {(recentLeads ?? []).length === 0 && <p className="px-5 py-6 text-muted-foreground text-sm text-center">No leads yet.</p>}
          {(recentLeads ?? []).map((lead: any) => (
            <div key={lead.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.requirement ?? "—"}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lead.qualification_score === "Hot" ? "bg-red-100 text-red-700" : lead.qualification_score === "Warm" ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                {lead.qualification_score ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}