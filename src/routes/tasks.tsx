import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Task, type Engagement, getCurrentUserId } from "@/lib/supabase";
import { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Firmora" }] }),
  component: TasksPage,
});

function TasksPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("tasks")
        .select("*, engagements(title)")
        .eq("user_id", userId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const { data: engagements } = useQuery({
    queryKey: ["engagements-for-select"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase
        .from("engagements")
        .select("id, title")
        .eq("user_id", userId ?? "")
        .order("created_at", { ascending: false });
      return (data ?? []) as Pick<Engagement, "id" | "title">[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_complete }: { id: string; is_complete: boolean }) => {
      const { error } = await supabase.from("tasks").update({ is_complete }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("tasks").insert({ ...payload, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
    },
  });

  const completedCount = useMemo(() =>
    tasks?.filter(t => t.is_complete).length ?? 0, [tasks]);

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; tasks: Task[] }>();
    const filtered = showCompleted
      ? tasks
      : tasks?.filter(t => !t.is_complete);
    filtered?.forEach((t) => {
      const key = t.engagement_id;
      if (!map.has(key)) {
        map.set(key, { title: t.engagements?.title ?? "Unknown Engagement", tasks: [] });
      }
      map.get(key)!.tasks.push(t);
    });
    return Array.from(map.entries());
  }, [tasks, showCompleted]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
          <p className="text-muted-foreground text-sm">Tasks grouped by engagement</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCompleted(p => !p)}
            className="inline-flex items-center gap-2 bg-card border border-input text-muted-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-muted"
          >
            {showCompleted ? "Hide Completed" : `Show Completed (${completedCount})`}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
          >
            <Plus size={16} /> Add Task
          </button>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}
      {!isLoading && grouped.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-3xl mb-3">🎉</p>
          <p className="font-medium text-foreground">All caught up! No pending tasks.</p>
          {completedCount > 0 && (
            <button onClick={() => setShowCompleted(true)} className="text-primary text-sm mt-2 hover:underline">
              Show {completedCount} completed task{completedCount !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {grouped.map(([id, group]) => (
          <div key={id} className="bg-card border border-border rounded-lg shadow-sm">
            <div className="px-5 py-3 border-b border-border bg-muted rounded-t-lg">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{group.title}</h3>
                {group.tasks.every(t => t.is_complete) && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">All Done ✓</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}</p>
            </div>
            <ul className="divide-y divide-border">
              {group.tasks.map((t) => (
                <li key={t.id} className="px-5 py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={t.is_complete}
                    onChange={(e) => toggleMutation.mutate({ id: t.id, is_complete: e.target.checked })}
                    className="w-4 h-4 text-primary rounded border-input focus:ring-ring"
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${t.is_complete ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {t.title}
                    </p>
                    {t.assigned_to && <p className="text-xs text-muted-foreground">Assigned: {t.assigned_to}</p>}
                    {t.due_date && (
                      <p className="text-xs text-muted-foreground">Due: {new Date(t.due_date).toLocaleDateString("en-IN")}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {open && (
        <TaskModal
          engagements={engagements ?? []}
          onClose={() => setOpen(false)}
          onSubmit={addMutation.mutate}
          pending={addMutation.isPending}
        />
      )}
    </div>
  );
}

function TaskModal({
  engagements, onClose, onSubmit, pending,
}: {
  engagements: Pick<Engagement, "id" | "title">[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({ engagement_id: "", title: "", assigned_to: "", due_date: "" });
  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Add Task</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, is_complete: false }); }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Engagement *</label>
            <select required value={form.engagement_id} onChange={(e) => setForm({ ...form, engagement_id: e.target.value })} className={inputClass}>
              <option value="">Select an engagement</option>
              {engagements.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Task Title *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Assigned To</label>
            <input value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Due Date</label>
            <input type="date" value={form.due_date ?? ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : "Save Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
