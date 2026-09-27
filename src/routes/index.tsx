import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { Users, Briefcase, Calendar, AlertTriangle, FileText, MessageCircle, ChevronRight } from "lucide-react";
import { format, addDays, isBefore, differenceInCalendarDays, differenceInDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — Firmora" }] }),
  component: Dashboard,
});

function StatCard({ label, value, icon: Icon, color, sub, href }: {
  label: string; value: number | string; icon: any; color: string; sub?: string; href?: string;
}) {
  const goTo = () => { if (href) window.location.href = href; };
  return (
    <div
      role={href ? "link" : undefined}
      tabIndex={href ? 0 : undefined}
      onClick={href ? goTo : undefined}
      onKeyDown={(e) => { if (href && e.key === "Enter") goTo(); }}
      className={`bg-card border border-border rounded-lg p-5 shadow-sm ${href ? "cursor-pointer hover:shadow-md hover:border-input transition-all" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={22} className="text-primary-foreground" />
        </div>
      </div>
    </div>
  );
}

// ✅ Today's Focus action item type
type FocusItem = {
  id: string;
  priority: "critical" | "attention";
  type: "compliance" | "invoice" | "document" | "lead" | "task";
  clientName: string;
  description: string;
  detail: string;
  href: string;
  action: string;
  waPhone?: string;
};

function TodaysFocus({ items }: { items: FocusItem[] }) {
  if (items.length === 0) return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-semibold text-foreground">Today's Focus</h2>
      </div>
      <p className="px-5 py-8 text-center text-sm text-muted-foreground">
        🎉 Nothing urgent today — you're on top of things!
      </p>
    </div>
  );

  // Group by type
  const critical = items.filter(i => i.priority === "critical");
  const attention = items.filter(i => i.priority === "attention");

  const handleWA = (item: FocusItem) => {
    const phone = (item.waPhone ?? "").replace(/\D/g, "");
    const url = phone ? `https://wa.me/91${phone}` : `https://wa.me/`;
    window.open(url, "_blank");
  };

  const renderItem = (item: FocusItem) => {
    const typeColors: Record<string, string> = {
      compliance: "bg-red-100 text-red-700",
      invoice: "bg-orange-100 text-orange-700",
      document: "bg-amber-100 text-amber-700",
      lead: "bg-purple-100 text-purple-700",
      task: "bg-blue-100 text-blue-700",
    };
    const typeLabels: Record<string, string> = {
      compliance: "Compliance",
      invoice: "Invoice",
      document: "Documents",
      lead: "Lead",
      task: "Task",
    };

    return (
      <div key={item.id} className={`flex items-center justify-between py-3 px-4 gap-3 ${item.priority === "critical" ? "border-l-4 border-red-500 bg-red-50/40" : "border-l-4 border-amber-400 bg-amber-50/30"}`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-foreground text-sm">{item.clientName}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${typeColors[item.type]}`}>
              {typeLabels[item.type]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.waPhone && (
            <button onClick={() => handleWA(item)} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-md font-medium hover:bg-green-100">
              <MessageCircle size={12} /> WA
            </button>
          )}
          <a href={item.href} className="inline-flex items-center gap-1 text-xs bg-card border border-border text-foreground px-2.5 py-1 rounded-md font-medium hover:bg-muted">
            {item.action} <ChevronRight size={12} />
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-foreground">Today's Focus</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{items.length} item{items.length > 1 ? "s" : ""} need your attention</p>
        </div>
      </div>
      <div className="divide-y divide-border">
        {critical.length > 0 && (
          <div className="px-4 py-2 bg-red-50/30">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">🔴 Critical</p>
          </div>
        )}
        {critical.map(renderItem)}
        {attention.length > 0 && (
          <div className="px-4 py-2 bg-amber-50/30">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">🟠 Needs Attention</p>
          </div>
        )}
        {attention.map(renderItem)}
      </div>
    </div>
  );
}

function Dashboard() {
  const now = new Date();

  const { data: clients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("user_id", userId ?? "");
      return count ?? 0;
    },
    refetchInterval: 30000, staleTime: 0, refetchOnWindowFocus: true,
  });

  const { data: engagements } = useQuery({
    queryKey: ["engagements-all"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("engagements")
        .select("*, clients!inner(name, firm_name, status, phone, whatsapp_number)")
        .eq("user_id", userId ?? "")
        .neq("clients.status", "deleted")
        .neq("clients.status", "archived")
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

  const { data: invoices } = useQuery({
    queryKey: ["dashboard-invoices"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("invoices")
        .select("id, amount, total_amount, status, due_date, clients(name, phone)")
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
          .lt("due_date", today).order("due_date", { ascending: true }).limit(5);

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

  const totalOutstanding = (invoices ?? []).reduce((sum, inv) => {
    if (inv.status === "Paid") return sum;
    return sum + Number(inv.total_amount ?? inv.amount ?? 0);
  }, 0);

  const activeEngClient: Record<string, string> = {};
  (engagements ?? []).forEach((e: any) => { if (isActiveEng(e)) activeEngClient[e.id] = e.client_id; });
  const activePendingDocs = (pendingChecklistDocs ?? []).filter((d) => activeEngClient[d.engagement_id]);
  const clientsWaiting = new Set(activePendingDocs.map((d) => activeEngClient[d.engagement_id])).size;
  const pendingDocsTotal = activePendingDocs.length;
  const mandatoryDocsPending = activePendingDocs.filter((d) => d.requirement === "mandatory").length;

  // ✅ getTodayFocus — build action items from existing data
  const todaysFocus: FocusItem[] = [];
  const today = format(startOfDay(now), "yyyy-MM-dd");

  // 1. Overdue compliance (critical)
  (complianceItems ?? []).filter((i: any) => i.isOverdue).slice(0, 3).forEach((i: any) => {
    const daysOverdue = differenceInDays(now, new Date(i.dueDate));
    todaysFocus.push({
      id: `comp-${i.id}`,
      priority: "critical",
      type: "compliance",
      clientName: i.clientName,
      description: `${i.complianceType} — ${daysOverdue === 0 ? "due today" : `${daysOverdue}d overdue`}`,
      detail: i.complianceType,
      href: "/compliance",
      action: "Review",
    });
  });

  // 2. Compliance due today (critical)
  (complianceItems ?? []).filter((i: any) => !i.isOverdue && i.dueDate === today).forEach((i: any) => {
    todaysFocus.push({
      id: `comp-today-${i.id}`,
      priority: "critical",
      type: "compliance",
      clientName: i.clientName,
      description: `${i.complianceType} — due today`,
      detail: i.complianceType,
      href: "/compliance",
      action: "Review",
    });
  });

  // 3. Overdue invoices (critical)
  (invoices ?? []).filter((inv: any) => {
    if (!inv.due_date || inv.status === "Paid") return false;
    return new Date(inv.due_date) < now;
  }).slice(0, 2).forEach((inv: any) => {
    const days = differenceInDays(now, new Date(inv.due_date));
    const amt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(inv.total_amount ?? inv.amount ?? 0));
    const phone = inv.clients?.phone ?? "";
    todaysFocus.push({
      id: `inv-${inv.id}`,
      priority: days > 30 ? "critical" : "attention",
      type: "invoice",
      clientName: inv.clients?.name ?? "—",
      description: `${amt} overdue by ${days} day${days !== 1 ? "s" : ""}`,
      detail: "Invoice",
      href: "/invoices",
      action: "Open Invoice",
      waPhone: phone,
    });
  });

  // 4. Engagements with blocked docs (attention)
  (engagements ?? []).filter(isActiveEng).forEach((e: any) => {
    const blocked = activePendingDocs.filter(d => d.engagement_id === e.id && d.requirement === "mandatory");
    if (blocked.length > 0) {
      todaysFocus.push({
        id: `doc-${e.id}`,
        priority: "attention",
        type: "document",
        clientName: e.clients?.name ?? "—",
        description: `${blocked.length} mandatory doc${blocked.length > 1 ? "s" : ""} pending — blocking ${e.title}`,
        detail: "Documents",
        href: "/engagements",
        action: "Request",
        waPhone: e.clients?.phone ?? e.clients?.whatsapp_number ?? "",
      });
    }
  });

  // 5. Hot leads needing follow-up (attention)
  (recentLeads ?? []).filter((l: any) => l.qualification_score === "Hot").slice(0, 2).forEach((l: any) => {
    todaysFocus.push({
      id: `lead-${l.id}`,
      priority: "attention",
      type: "lead",
      clientName: l.name,
      description: `Hot lead — ${l.requirement ?? "follow-up needed"}`,
      detail: "Lead",
      href: "/leads",
      action: "Follow Up",
      waPhone: l.phone ?? "",
    });
  });

  // Limit to 6 items max
  const focusItems = todaysFocus.slice(0, 6);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Overview of your practice — {format(now, "EEEE, dd MMM yyyy")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={clients ?? 0} icon={Users} color="bg-primary" href="/clients" />
        <StatCard label="Total Outstanding" value={new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(totalOutstanding)} icon={Briefcase} color="bg-indigo-500" href="/invoices" />
        <StatCard label="Active Engagements" value={activeCount} icon={Briefcase} color="bg-indigo-500" href="/engagements" />
        <StatCard label="Tasks Due This Week" value={tasksDueCount ?? 0} icon={Calendar} color="bg-amber-500" href="/tasks" />
        <StatCard label="Overdue Items" value={overdueCount} sub={`${overdueComplianceCount} compliance · ${overdueEngagements} engagements`} icon={AlertTriangle} color="bg-red-500" href="/compliance" />
        <StatCard label="Open Leads" value={openLeadsCount ?? 0} icon={Users} color="bg-purple-500" href="/leads" />
        <StatCard label="Clients Waiting for Docs" value={clientsWaiting} sub={`${pendingDocsTotal} docs · ${mandatoryDocsPending} mandatory`} icon={FileText} color="bg-orange-500" href="/documents" />
        <StatCard label="Overdue Invoices" value={overdueInvoicesCount ?? 0} icon={AlertTriangle} color="bg-red-500" href="/invoices" />
      </div>

      {/* ✅ TODAY'S FOCUS */}
      <TodaysFocus items={focusItems} />

      {/* Compliance */}
      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">Compliance — Overdue & Next 7 Days</h2>
            {overdueComplianceCount > 0 && (
              <p className="text-xs text-red-600 font-medium mt-0.5">
                ⚠️ {overdueComplianceCount} overdue item{overdueComplianceCount > 1 ? "s" : ""}
              </p>
            )}
          </div>
          <a href="/compliance" className="text-primary text-sm hover:underline font-medium">View All →</a>
        </div>
        <div className="divide-y divide-border">
          {(complianceItems ?? []).length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No upcoming or overdue compliance items.</p>
          )}
          {(complianceItems ?? []).map((item: any) => {
            const dueDate = item.dueDate ? new Date(item.dueDate) : null;
            const daysRemaining = dueDate ? differenceInCalendarDays(startOfDay(dueDate), startOfDay(new Date())) : 0;
            let dueLabel = "", labelClass = "", rowClass = "";
            if (item.isOverdue) {
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
              <div key={item.id} className={`flex items-center justify-between py-3 px-4 ${rowClass}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm truncate">{item.clientName}</p>
                  <p className="text-xs text-muted-foreground">{item.complianceType}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelClass}`}>{dueLabel}</span>
                  <span className="text-sm font-medium text-foreground">{dueDate ? format(dueDate, "dd MMM yyyy") : "—"}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Leads */}
      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Recent Leads</h2>
          <a href="/leads" className="text-primary text-sm hover:underline font-medium">View All →</a>
        </div>
        <div className="divide-y divide-border">
          {(recentLeads ?? []).length === 0 && (
            <p className="px-5 py-6 text-muted-foreground text-sm text-center">No leads yet.</p>
          )}
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
