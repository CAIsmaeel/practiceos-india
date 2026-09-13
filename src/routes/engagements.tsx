import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Engagement, type Client } from "@/lib/supabase";
import { useState } from "react";
import { Plus, X, Archive, Pencil } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/engagements")({
  head: () => ({ meta: [{ title: "Engagements — PracticeOS" }] }),
  component: EngagementsPage,
});

const TYPES = [
  "GST Return",
  "ITR Filing",
  "Statutory Audit",
  "Tax Audit",
  "ROC Filing",
  "MCA Compliance",
  "Other",
];

const STATUSES = ["pending", "in_progress", "completed", "billed", "on_hold"];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  billed: "bg-purple-100 text-purple-800",
  on_hold: "bg-gray-200 text-gray-700",
};

function EngagementsPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; engagement?: Engagement | null } | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);

  const { data: engagements, isLoading } = useQuery({
    queryKey: ["engagements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engagements")
        .select("*, clients!inner(name, firm_name, status)")
        .neq("clients.status", "deleted")
        .neq("clients.status", "archived")
        .order("deadline", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Engagement[];
    },
  });

  const filtered = hideCompleted
    ? engagements?.filter((e) => e.status !== "completed" && e.status !== "billed")
    : engagements;

  const { data: clients } = useQuery({
    queryKey: ["clients-for-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as Pick<Client, "id" | "name">[];
    },
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("engagements").update({ status }).eq("id", id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["engagements"] });
  };

  const archiveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from("engagements").update({ status: "completed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagements"] });
      qc.invalidateQueries({ queryKey: ["engagements-all"] });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from("engagements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagements"] });
      qc.invalidateQueries({ queryKey: ["engagements-all"] });
      setModalState(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Engagement> }) => {
      const { error } = await supabase.from("engagements").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagements"] });
      qc.invalidateQueries({ queryKey: ["engagements-all"] });
      setModalState(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Engagements</h1>
          <p className="text-slate-500 text-sm">Track all client engagements</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setHideCompleted((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border ${
              hideCompleted
                ? "bg-blue-500 text-white border-blue-500 hover:bg-blue-600"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {hideCompleted ? "Hide Completed" : "Hide Completed"}
          </button>
          <button
            onClick={() => setModalState({ mode: "create" })}
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            <Plus size={16} /> Add Engagement
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Deadline</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Assigned To</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {!isLoading && filtered?.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No engagements found.</td></tr>
            )}
            {filtered?.map((e: Engagement) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{e.clients?.name ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{e.title}</td>
                <td className="px-5 py-3 text-slate-700">{e.type}</td>
                <td className="px-5 py-3 text-slate-700">
                  {e.deadline ? format(new Date(e.deadline), "dd MMM yyyy") : "—"}
                </td>
                <td className="px-5 py-3">
                  <select
                    value={e.status}
                    onChange={(event) => {
                      void updateStatus(e.id, event.target.value);
                    }}
                    className={`rounded-md border-0 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${statusColors[e.status]}`}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-5 py-3 text-slate-700">{e.assigned_to ?? "—"}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModalState({ mode: "edit", engagement: e })}
                      className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    {e.status !== "completed" && (
                      <button
                        onClick={() => archiveMutation.mutate({ id: e.id })}
                        disabled={archiveMutation.isPending}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
                        title="Archive"
                      >
                        <Archive size={14} /> Archive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalState && (
        <EngagementModal
          mode={modalState.mode}
          initialEngagement={modalState.engagement ?? undefined}
          clients={clients ?? []}
          onClose={() => setModalState(null)}
          onSubmit={(payload) => {
            if (modalState.mode === "edit" && modalState.engagement?.id) {
              updateMutation.mutate({ id: modalState.engagement.id, payload });
              return;
            }
            addMutation.mutate(payload);
          }}
          pending={addMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

function EngagementModal({
  mode,
  initialEngagement,
  clients,
  onClose,
  onSubmit,
  pending,
}: {
  mode: "create" | "edit";
  initialEngagement?: Engagement | null;
  clients: Pick<Client, "id" | "name">[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    client_id: initialEngagement?.client_id ?? "",
    title: initialEngagement?.title ?? "",
    type: initialEngagement?.type ?? "GST Return",
    deadline: initialEngagement?.deadline ?? "",
    assigned_to: initialEngagement?.assigned_to ?? "",
    status: initialEngagement?.status ?? "pending",
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">{mode === "edit" ? "Edit Engagement" : "Add Engagement"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ ...form, deadline: form.deadline || null });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
            <select
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
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
              {pending ? "Saving..." : mode === "edit" ? "Update Engagement" : "Save Engagement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
