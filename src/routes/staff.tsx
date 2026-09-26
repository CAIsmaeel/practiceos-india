import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { useState } from "react";
import { Plus, X, Pencil, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — Firmora" }] }),
  component: StaffPage,
});

const ROLES = ["Article Assistant", "Semi-Qualified", "Qualified CA", "Manager", "Partner", "Admin", "Other"];

type Staff = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  user_id: string;
  created_at: string;
};

function StaffPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; staff?: Staff | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: staffList, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("user_id", userId ?? "")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Staff[];
    },
  });

  // Engagement counts per staff
  const { data: engagements } = useQuery({
    queryKey: ["engagements-for-staff"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase
        .from("engagements")
        .select("id, assigned_to, reviewed_by, status, title, clients!inner(name)")
        .eq("user_id", userId ?? "")
        .neq("status", "completed")
        .neq("status", "billed");
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Omit<Staff, "id" | "created_at">) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("staff").insert({ ...payload, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setModalState(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Staff> }) => {
      const { error } = await supabase.from("staff").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setModalState(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setDeleteConfirm(null);
    },
  });

  // Build workload map
  const workloadMap: Record<string, { asmaker: any[]; aschecker: any[] }> = {};
  (staffList ?? []).forEach(s => {
    workloadMap[s.name] = { asmaker: [], aschecker: [] };
  });
  (engagements ?? []).forEach((e: any) => {
    if (e.assigned_to && workloadMap[e.assigned_to]) {
      workloadMap[e.assigned_to].asmaker.push(e);
    }
    if (e.reviewed_by && workloadMap[e.reviewed_by]) {
      workloadMap[e.reviewed_by].aschecker.push(e);
    }
  });

  const roleColors: Record<string, string> = {
    "Article Assistant": "bg-blue-100 text-blue-800",
    "Semi-Qualified": "bg-indigo-100 text-indigo-800",
    "Qualified CA": "bg-purple-100 text-purple-800",
    "Manager": "bg-orange-100 text-orange-800",
    "Partner": "bg-red-100 text-red-800",
    "Admin": "bg-slate-100 text-slate-700",
    "Other": "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff</h1>
          <p className="text-muted-foreground text-sm">Manage your team members and their workload</p>
        </div>
        <button
          onClick={() => setModalState({ mode: "create" })}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Add Staff Member
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {ROLES.slice(0, 4).map(role => {
          const count = staffList?.filter(s => s.role === role).length ?? 0;
          return count > 0 ? (
            <div key={role} className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium">{role}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{count}</p>
            </div>
          ) : null;
        })}
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">Total Staff</p>
          <p className="text-2xl font-bold text-foreground mt-1">{staffList?.length ?? 0}</p>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-card border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-left">
            <tr>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Name</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Role</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Email</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Active Work</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && staffList?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Users size={32} className="text-muted-foreground/50" />
                    <p>No staff members yet. Add your first team member!</p>
                  </div>
                </td>
              </tr>
            )}
            {staffList?.map((s) => {
              const wl = workloadMap[s.name] ?? { asmaker: [], aschecker: [] };
              const totalWork = wl.asmaker.length + wl.aschecker.length;
              return (
                <tr key={s.id} className="hover:bg-muted">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      {s.name}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {s.role ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[s.role] ?? "bg-gray-100 text-gray-700"}`}>
                        {s.role}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{s.email ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{s.phone ?? "—"}</td>
                  <td className="px-5 py-3">
                    {totalWork > 0 ? (
                      <div className="flex items-center gap-2">
                        {wl.asmaker.length > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                            {wl.asmaker.length} as Maker
                          </span>
                        )}
                        {wl.aschecker.length > 0 && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                            {wl.aschecker.length} as Checker
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No active work</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModalState({ mode: "edit", staff: s })}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(s.id)}
                        className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Workload Overview */}
      {staffList && staffList.length > 0 && engagements && engagements.length > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-sm p-5">
          <h2 className="font-semibold text-foreground mb-4">Current Workload</h2>
          <div className="space-y-3">
            {staffList.map(s => {
              const wl = workloadMap[s.name] ?? { asmaker: [], aschecker: [] };
              const total = wl.asmaker.length + wl.aschecker.length;
              if (total === 0) return null;
              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{total} engagements</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {wl.asmaker.map((e: any) => (
                      <span key={e.id} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                        {e.clients?.name} — {e.title}
                      </span>
                    ))}
                    {wl.aschecker.map((e: any) => (
                      <span key={e.id} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
                        ✓ {e.clients?.name} — {e.title}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-foreground mb-2">Remove Staff Member?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will remove them from your staff list. Their name will remain on existing engagements.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border border-input rounded-md text-foreground hover:bg-muted">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-60"
              >
                {deleteMutation.isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalState && (
        <StaffModal
          mode={modalState.mode}
          initialStaff={modalState.staff ?? undefined}
          onClose={() => setModalState(null)}
          onSubmit={(payload) => {
            if (modalState.mode === "edit" && modalState.staff?.id) {
              updateMutation.mutate({ id: modalState.staff.id, payload });
              return;
            }
            addMutation.mutate(payload as any);
          }}
          pending={addMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

function StaffModal({ mode, initialStaff, onClose, onSubmit, pending }: {
  mode: "create" | "edit";
  initialStaff?: Staff | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    name: initialStaff?.name ?? "",
    role: initialStaff?.role ?? "",
    email: initialStaff?.email ?? "",
    phone: initialStaff?.phone ?? "",
  });

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{mode === "edit" ? "Edit Staff Member" : "Add Staff Member"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
            <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g. Rahul Sharma" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Role</label>
            <select value={form.role} onChange={(e) => setForm({...form, role: e.target.value})} className={inputClass}>
              <option value="">Select role</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} placeholder="rahul@yourfirm.com" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} placeholder="9876543210" className={inputClass} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update" : "Add Staff"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
