import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Users, Briefcase, Calendar, AlertTriangle } from "lucide-react";
import { format, addDays, isAfter, isBefore } from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — PracticeOS" }] }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | string;
  icon: any;
  color: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}
        >
          <Icon size={22} className="text-white" />
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: clients } = useQuery({
    queryKey: ["clients-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: engagements } = useQuery({
    queryKey: ["engagements-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("engagements")
        .select("*, clients(name, firm_name)")
        .order("deadline", { ascending: true });
      return data ?? [];
    },
  });

  const { data: tasksDue } = useQuery({
    queryKey: ["tasks-due-week"],
    queryFn: async () => {
      const today = new Date();
      const weekFromNow = addDays(today, 7);
      // tasks themselves don't have deadlines; use engagement deadlines for "tasks due"
      const { data } = await supabase
        .from("tasks")
        .select("*, engagements(deadline)")
        .eq("is_complete", false);
      return (data ?? []).filter((t: any) => {
        const d = t.engagements?.deadline;
        if (!d) return false;
        const dt = new Date(d);
        return isAfter(dt, today) && isBefore(dt, weekFromNow);
      }).length;
    },
  });

  const now = new Date();
  const weekAhead = addDays(now, 7);
  const activeCount =
    engagements?.filter((e: any) => e.status !== "completed" && e.status !== "billed")
      .length ?? 0;
  const overdueCount =
    engagements?.filter(
      (e: any) =>
        e.deadline &&
        isBefore(new Date(e.deadline), now) &&
        e.status !== "completed" &&
        e.status !== "billed",
    ).length ?? 0;
  const upcoming =
    engagements?.filter(
      (e: any) =>
        e.deadline &&
        isAfter(new Date(e.deadline), now) &&
        isBefore(new Date(e.deadline), weekAhead),
    ) ?? [];

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
          label="Active Engagements"
          value={activeCount}
          icon={Briefcase}
          color="bg-indigo-500"
        />
        <StatCard
          label="Tasks Due This Week"
          value={tasksDue ?? 0}
          icon={Calendar}
          color="bg-amber-500"
        />
        <StatCard
          label="Overdue Engagements"
          value={overdueCount}
          icon={AlertTriangle}
          color="bg-red-500"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Upcoming Deadlines (Next 7 days)</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {upcoming.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No upcoming deadlines.
            </p>
          )}
          {upcoming.map((e: any) => (
            <div
              key={e.id}
              className="px-5 py-3 flex items-center justify-between hover:bg-slate-50"
            >
              <div>
                <p className="font-medium text-slate-900">{e.title}</p>
                <p className="text-xs text-slate-500">
                  {e.clients?.name ?? "—"} · {e.type}
                </p>
              </div>
              <div className="text-sm text-blue-600 font-medium">
                {format(new Date(e.deadline), "dd MMM yyyy")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
