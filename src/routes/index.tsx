import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { Users, Briefcase, Calendar, AlertTriangle, FileText } from "lucide-react";
import { format, addDays, isBefore, differenceInCalendarDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — PracticeOS" }] }),
  component: Dashboard,
});

function StatCard({ label, value, icon: Icon, color, sub, href }: {
  label: string;
  value: number | string;
  icon: any;
  color: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={22} className="text-white" />
      </div>
    </div>
  );

  if (href) {
    return (
      
        href={href}
        className="block bg-white border border-slate-200 rounded-lg p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
      >
        {inner}
      </a>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
      {inner}
    </div>
  );
}

function Dashboard() {
  const now = new Date();

  const { data: clients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId ?? "");
      return count ?? 0;
    },
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: engagements } = useQuery({
    queryKey: ["engagements-all"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase
        .from("engagements")
        .select("*, clients!inner(name, firm_name, status)")
        .eq("user_id", userId ?? "")
        .neq("clients.status", "deleted")
        .neq("clients.status", "archived")
        .order("deadline", { ascending: true });
      return data ?? [];
    },
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: tasksDueCount } = useQuery({
    queryKey: ["tasks-due-week"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const today = new Date().toISOString().split("T")[0];
        const next7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const { count } = await supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId ?? "")
          .gte("due_date", today)
          .lte("due_date", next7)
          .eq("is_complete", false);
        return count ?? 0;
      } catch { return 0; }
    },
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: openLeadsCount } = useQuery({
    queryKey: ["open-leads-count"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { count } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId ?? "")
          .not("status", "in", '("Converted","Lost","Cold-Closed")');
        return count ?? 0;
      } catch { return 0; }
    },
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // ✅ NEW: Pending docs from engagement checklists (same source as Documents page)
  const { data: pendingChecklistDocs } = useQuery({
    queryKey: ["dashboard-pending-docs"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { data } = await supabase
          .from("engagement_documents")
          .select("engagement_id, requirement")
          .eq("user_id", userId ?? "")
          .eq("status", "pending");
        return (data ?? []) as { engagement_id: string; requirement: string }[];
      } catch { return []; }
    },
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: invoices } = useQuery({
    queryKey: ["dashboard-invoices"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase
        .from("invoices")
        .select("id, amount, total_amount, status, due_date")
        .eq("user_id", userId ?? "")
        .order("due_date", { ascending: true, nullsFirst: false });
      return (data ?? []) as Array<{
        id: string;
        amount: number | null;
        total_amount: number | null;
        status: string | null;
        due_date: string | null;
      }>;
    },
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: overdueInvoicesCount } = useQuery({
    queryKey: ["overdue-invoices-count"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const today = new Date();
        const { data } = await supabase
          .from("invoices")
          .select("id, status, due_date")
          .eq("user_id", userId ?? "")
          .not("status", "eq", "Paid");
        return (data ?? []).filter((inv: any) => {
          if (!inv.due_date || inv.status === "Paid") return false;
          return new Date(inv.due_date) < today;
        }).length;
      } catch { return 0; }
    },
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: recentLeads } = useQuery({
    queryKey: ["recent-leads"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const { data } = await supabase
          .from("leads")
          .select("id, name, requirement, qualification_score")
          .eq("user_id", userId ?? "")
          .not("status", "in", '("Converted","Lost","Cold-Closed")')
          .order("created_at", { ascending: false })
          .limit(5);
        return data ?? [];
      } catch { return []; }
    },
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Overdue + Upcoming compliance combined
  const { data: complianceItems } = useQuery({
    queryKey: ["dashboard-compliance"],
    queryFn: async () => {
      try {
        const userId = await getCurrentUserId();
        const today = format(startOfDay(new Date()), "yyyy-MM-dd");
        const next7 = format(startOfDay(addDays(new Date(), 7)), "yyyy-MM-dd");

        // Overdue items
        const { data: overdueData } = await supabase
          .from("compliance_items")
          .select("id, compliance_type, due_date, status, client_id, clients!inner(name, status)")
          .eq("user_id", userId ?? "")
          .eq("status", "pending")
          .neq("clients.status", "deleted")
          .neq("clients.status", "archived")
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(5);

        // Upcoming 7 days
        const { data: upcomingData } = await supabase
          .from("compliance_items")
          .select("id, compliance_type, due_date, status, client_id, clients!inner(name, status)")
          .eq("user_id", userId ?? "")
          .eq("status", "pending")
          .neq("clients.status", "deleted")
          .neq("clients.status", "archived")
          .gte("due_date", today)
          .lte("due_date", next7)
          .order("due_date", { ascending: true });

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
    refetchInterval: 30000,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const isActiveEng = (e: any) => e.status !== "completed" && e.status !== "billed";

  const activeCount = engagements?.filter(isActiveEng).length ?? 0;

  const overdueEngagements = engagements?.filter(
    (e: any) => e.deadline && isBefore(new Date(e.deadline), now) && isActiveEng(e)
  ).length ?? 0;

  const overdueComplianceCount = complianceItems?.filter((i: any) => i.isOverdue).length ?? 0;
  const overdueCount = overdueEngagements + overdueComplianceCount;

  const totalOutstanding = (invoices ?? []).reduce((sum, inv) => {
    if (inv.status === "Paid") return sum;
    return sum + Number(inv.total_amount ?? inv.amount ?? 0);
  }, 0);

  // ✅ NEW: Clients waiting for docs (only active engagements, same as Documents page)
  const activeEngClient: Record<string, string> = {};
  (engagements ?? []).forEach((e: any) => {
    if (isActiveEng(e)) activeEngClient[e.id] = e.client_id;
  });
  const activePendingDocs = (pendingChecklistDocs ?? []).filter(
    (d) => activeEngClient[d.engagement_id]
  );
  const clientsWaiting = new Set(activePendingDocs.map((d) => activeEngClient[d.engagement_id])).size;
  const pendingDocsTotal = activePendingDocs.length;
  const mandatoryDocsPending = activePendingDocs.filter((d) => d.requirement === "mandatory").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm">
          Overview of your practice — {format(now, "EEEE, dd MMM yyyy")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Clients" value={clients ?? 0} icon={Users} color="bg-blue-500" />
        <StatCard
          label="Total Outstanding"
          value={new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(totalOutstanding)}
          icon={Briefcase}
          color="bg-indigo-500"
        />
        <StatCard label="Active Engagements" value={activeCount} icon={Briefcase} color="bg-indigo-500" />
        <StatCard label="Tasks Due This Week" value={tasksDueCount ?? 0} icon={Calendar} color="bg-amber-500" />
        <StatCard label="Overdue Items" value={overdueCount} icon={AlertTriangle} color="bg-red-500" />
        <StatCard label="Open Leads" value={openLeadsCount ?? 0} icon={Users} color="bg-purple-500" />
        <StatCard
          label="Clients Waiting for Docs"
          value={clientsWaiting}
          sub={`${pendingDocsTotal} docs · ${mandatoryDocsPending} mandatory`}
          icon={FileText}
          color="bg-orange-500"
          href="/documents"
        />
        <StatCard label="Overdue Invoices" value={overdueInvoicesCount ?? 0} icon={AlertTriangle} color="bg-red-500" />
      </div>

      {/* Compliance — Overdue + Upcoming + View All button */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-900">Compliance — Overdue & Next 7 Days</h2>
            {overdueComplianceCount > 0 && (
              <p className="text-xs text-red-600 font-medium mt-0.5">
                ⚠️ {overdueComplianceCount} overdue item{overdueComplianceCount > 1 ? "s" : ""}
              </p>
            )}
          </div>
          <a href="/compliance" className="text-blue-500 text-sm hover:underline font-medium">
            View All →
          </a>
        </div>
        <div className="divide-y divide-slate-100">
          {(complianceItems ?? []).length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No upcoming or overdue compliance items.
            </p>
          )}
          {(complianceItems ?? []).map((item: any) => {
            const dueDate = item.dueDate ? new Date(item.dueDate) : null;
            const daysRemaining = dueDate
              ? differenceInCalendarDays(startOfDay(dueDate), startOfDay(new Date()))
              : 0;

            let dueLabel = "";
            let labelClass = "";
            let rowClass = "";

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
                  <p className="font-medium text-slate-900 text-sm truncate">{item.clientName}</p>
                  <p className="text-xs text-slate-500">{item.complianceType}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${labelClass}`}>
                    {dueLabel}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {dueDate ? format(dueDate, "dd MMM yyyy") : "—"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Leads */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Recent Leads</h2>
          <a href="/leads" className="text-blue-500 text-sm hover:underline font-medium">
            View All →
          </a>
        </div>
        <div className="divide-y divide-slate-100">
          {(recentLeads ?? []).length === 0 && (
            <p className="px-5 py-6 text-slate-500 text-sm text-center">No leads yet.</p>
          )}
          {(recentLeads ?? []).map((lead: any) => (
            <div key={lead.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900 text-sm">{lead.name}</p>
                <p className="text-xs text-slate-500">{lead.requirement ?? "—"}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                lead.qualification_score === "Hot" ? "bg-red-100 text-red-700" :
                lead.qualification_score === "Warm" ? "bg-orange-100 text-orange-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {lead.qualification_score ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}