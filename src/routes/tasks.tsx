import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Task, type Engagement } from "@/lib/supabase";
import { useState, useMemo } from "react";
import { Plus, X } from "lucide-react";

export const Route = createFileRoute("/tasks")({
  head: () => ({ meta: [{ title: "Tasks — PracticeOS" }] }),
  component: TasksPage,
});

function TasksPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, engagements(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const { data: engagements } = useQuery({
    queryKey: ["engagements-for-select"],
    queryFn: async () => {
      const { data } = await supabase
        .from("engagements")
        .select("id, title")
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
      const { error } = await supabase.from("tasks").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; tasks: Task[] }>();
    tasks?.forEach((t) => {
      const key = t.engagement_id;
      if (!map.has(key)) {
        map.set(key, { title: t.engagements?.title ?? "Unknown Engagement", tasks: [] });
      }
      map.get(key)!.tasks.push(t);
    });
    return Array.from(map.entries());
  }, [tasks]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500 text-sm">Tasks grouped by engagement</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Add Task
        </button>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading...</p>}
      {!isLoading && grouped.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">
          No tasks yet.
        </div>
      )}

      <div className="space-y-4">
        {grouped.map(([id, group]) => (
          <div key={id} className="bg-white border border-slate-200 rounded-lg shadow-sm">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 rounded-t-lg">
              <h3 className="font-semibold text-slate-900">{group.title}</h3>
              <p className="text-xs text-slate-500">{group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {group.tasks.map((t) => (
                <li key={t.id} className="px-5 py-3 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={t.is_complete}
                    onChange={(e) =>
                      toggleMutation.mutate({ id: t.id, is_complete: e.target.checked })
                    }
                    className="w-4 h-4 text-blue-500 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${t.is_complete ? "line-through text-slate-400" : "text-slate-900"}`}>
                      {t.title}
                    </p>
                    {t.assigned_to && (
                      <p className="text-xs text-slate-500">Assigned: {t.assigned_to}</p>
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
  engagements,
  onClose,
  onSubmit,
  pending,
}: {
  engagements: Pick<Engagement, "id" | "title">[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({ engagement_id: "", title: "", assigned_to: "" });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Add Task</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ ...form, is_complete: false });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Engagement *</label>
            <select
              required
              value={form.engagement_id}
              onChange={(e) => setForm({ ...form, engagement_id: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select an engagement</option>
              {engagements.map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Task Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Assigned To</label>
            <input
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
