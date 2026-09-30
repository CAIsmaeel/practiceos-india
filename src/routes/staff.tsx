import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { useState, useRef } from "react";
import { Plus, X, Pencil, Trash2, Users, Upload, Download, Settings } from "lucide-react";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — Firmora" }] }),
  component: StaffPage,
});

const DEFAULT_ROLES = [
  "Article Assistant", "Semi-Qualified", "Qualified CA",
  "Manager", "Partner", "Admin", "Other"
];

type Staff = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  user_id: string;
  created_at: string;
};

type StaffRole = {
  id: string;
  role_name: string;
  sort_order: number;
};

// ─── Role Manager Modal ───────────────────────────────────────────────────────
function RoleManagerModal({ roles, onClose, onSave }: {
  roles: StaffRole[];
  onClose: () => void;
  onSave: (roles: string[]) => void;
}) {
  const [list, setList] = useState<string[]>(
    roles.length > 0 ? roles.map(r => r.role_name) : [...DEFAULT_ROLES]
  );
  const [newRole, setNewRole] = useState("");

  const addRole = () => {
    const trimmed = newRole.trim();
    if (!trimmed || list.includes(trimmed)) return;
    setList([...list, trimmed]);
    setNewRole("");
  };

  const removeRole = (role: string) => setList(list.filter(r => r !== role));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Manage Designations</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {list.map((role, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-md">
                <span className="text-sm text-foreground">{role}</span>
                <button onClick={() => removeRole(role)} className="text-muted-foreground hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRole(); } }}
              placeholder="Add new designation..."
              className="flex-1 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={addRole} className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              <Plus size={15} />
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-input rounded-md text-foreground hover:bg-muted">Cancel</button>
            <button onClick={() => onSave(list)} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Excel Import Modal ───────────────────────────────────────────────────────
function ExcelImportModal({ roles, onClose, onImport, pending }: {
  roles: string[];
  onClose: () => void;
  onImport: (rows: Omit<Staff, "id" | "created_at" | "user_id">[]) => void;
  pending: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [error, setError] = useState("");

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Name *", "Role", "Email", "Phone"],
      ["CA Rahul Sharma", "Qualified CA", "rahul@firm.com", "9876543210"],
      ["Priya Patel", "Article Assistant", "priya@firm.com", "9876543211"],
    ]);
    ws["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 30 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff");
    XLSX.writeFile(wb, "staff_import_template.xlsx");
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    setPreview([]);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (rows.length < 2) { setError("File is empty or has no data rows."); return; }
        const data = rows.slice(1).filter(r => r[0]).map(r => ({
          name: String(r[0] ?? "").trim(),
          role: String(r[1] ?? "").trim() || null,
          email: String(r[2] ?? "").trim() || null,
          phone: String(r[3] ?? "").trim() || null,
        })).filter(r => r.name);
        if (data.length === 0) { setError("No valid rows found."); return; }
        setPreview(data);
      } catch {
        setError("Could not read file. Use .xlsx or .xls format.");
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-semibold text-foreground">Import Staff from Excel</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">

          {/* Step 1: Download template */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-700 mb-1">Step 1: Download Template</p>
            <p className="text-xs text-blue-600 mb-2">Fill in your staff details in the template. Columns: Name, Role, Email, Phone.</p>
            <button onClick={downloadTemplate} className="inline-flex items-center gap-2 text-xs bg-blue-700 text-white px-3 py-1.5 rounded-md hover:bg-blue-800">
              <Download size={13} /> Download Template
            </button>
          </div>

          {/* Available roles */}
          <div className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs font-semibold text-foreground mb-1">Available Roles (use exact spelling):</p>
            <div className="flex flex-wrap gap-1">
              {roles.map(r => (
                <span key={r} className="text-[10px] bg-card border border-border px-2 py-0.5 rounded-full text-muted-foreground">{r}</span>
              ))}
            </div>
          </div>

          {/* Step 2: Upload */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Step 2: Upload Filled File</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 border border-dashed border-border rounded-lg px-4 py-3 text-sm text-muted-foreground hover:bg-muted w-full justify-center">
              <Upload size={16} /> Click to select .xlsx file
            </button>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground mb-2">Preview ({preview.length} staff members)</p>
              <div className="border border-border rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Role</th>
                      <th className="px-3 py-2 text-left font-medium">Email</th>
                      <th className="px-3 py-2 text-left font-medium">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.map((r, i) => (
                      <tr key={i} className="hover:bg-muted">
                        <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.role ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-input rounded-md text-foreground hover:bg-muted">Cancel</button>
            <button
              onClick={() => preview.length > 0 && onImport(preview)}
              disabled={preview.length === 0 || pending}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Importing..." : `Import ${preview.length} Staff`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Staff Modal ──────────────────────────────────────────────────────────────
function StaffModal({ mode, initialStaff, onClose, onSubmit, pending, roles }: {
  mode: "create" | "edit";
  initialStaff?: Staff | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
  roles: string[];
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
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
            <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g. Rahul Sharma" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Role / Designation</label>
            <select value={form.role} onChange={(e) => setForm({...form, role: e.target.value})} className={inputClass}>
              <option value="">Select role</option>
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
function StaffPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; staff?: Staff | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showRoleManager, setShowRoleManager] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { data: staffList, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.from("staff").select("*").eq("user_id", userId ?? "").order("name");
      if (error) throw error;
      return (data ?? []) as Staff[];
    },
  });

  const { data: customRoles } = useQuery({
    queryKey: ["staff-roles"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("staff_roles").select("*").eq("user_id", userId ?? "").order("sort_order");
      return (data ?? []) as StaffRole[];
    },
  });

  const { data: engagements } = useQuery({
    queryKey: ["engagements-for-staff"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("engagements")
        .select("id, assigned_to, reviewed_by, status, title, clients!inner(name)")
        .eq("user_id", userId ?? "")
        .neq("status", "completed").neq("status", "billed");
      return data ?? [];
    },
  });

  // Effective roles — custom if set, else defaults
  const effectiveRoles = customRoles && customRoles.length > 0
    ? customRoles.map(r => r.role_name)
    : DEFAULT_ROLES;

  const saveRolesMutation = useMutation({
    mutationFn: async (roles: string[]) => {
      const userId = await getCurrentUserId();
      await supabase.from("staff_roles").delete().eq("user_id", userId ?? "");
      if (roles.length > 0) {
        const rows = roles.map((role_name, i) => ({ user_id: userId, role_name, sort_order: i }));
        const { error } = await supabase.from("staff_roles").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-roles"] });
      setShowRoleManager(false);
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Omit<Staff, "id" | "created_at">) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("staff").insert({ ...payload, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setModalState(null); },
  });

  const importMutation = useMutation({
    mutationFn: async (rows: Omit<Staff, "id" | "created_at" | "user_id">[]) => {
      const userId = await getCurrentUserId();
      const payload = rows.map(r => ({ ...r, user_id: userId }));
      const { error } = await supabase.from("staff").upsert(payload, { onConflict: "user_id,name", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setShowImport(false); },
    onError: (err: any) => alert("Import failed: " + (err?.message ?? "")),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Staff> }) => {
      const { error } = await supabase.from("staff").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setModalState(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff"] }); setDeleteConfirm(null); },
  });

  const workloadMap: Record<string, { asmaker: any[]; aschecker: any[] }> = {};
  (staffList ?? []).forEach(s => { workloadMap[s.name] = { asmaker: [], aschecker: [] }; });
  (engagements ?? []).forEach((e: any) => {
    if (e.assigned_to && workloadMap[e.assigned_to]) workloadMap[e.assigned_to].asmaker.push(e);
    if (e.reviewed_by && workloadMap[e.reviewed_by]) workloadMap[e.reviewed_by].aschecker.push(e);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Staff</h1>
          <p className="text-muted-foreground text-sm">Manage your team members and their workload</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowRoleManager(true)}
            className="inline-flex items-center gap-2 border border-input bg-card hover:bg-muted text-foreground px-3 py-2 rounded-md text-sm font-medium">
            <Settings size={15} /> Manage Roles
          </button>
          <button onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 border border-input bg-card hover:bg-muted text-foreground px-3 py-2 rounded-md text-sm font-medium">
            <Upload size={15} /> Import Excel
          </button>
          <button onClick={() => setModalState({ mode: "create" })}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
            <Plus size={16} /> Add Staff
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {effectiveRoles.slice(0, 4).map(role => {
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

      {/* Table */}
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
            {isLoading && <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && (staffList?.length ?? 0) === 0 && (
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
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {s.role}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{s.email ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs">{s.phone ?? "—"}</td>
                  <td className="px-5 py-3">
                    {totalWork > 0 ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {wl.asmaker.length > 0 && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{wl.asmaker.length} as Maker</span>}
                        {wl.aschecker.length > 0 && <span className="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">{wl.aschecker.length} as Checker</span>}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">No active work</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setModalState({ mode: "edit", staff: s })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium">
                        <Pencil size={13} /> Edit
                      </button>
                      <button onClick={() => setDeleteConfirm(s.id)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
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

      {/* Workload */}
      {(staffList?.length ?? 0) > 0 && (engagements?.length ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-sm p-5">
          <h2 className="font-semibold text-foreground mb-4">Current Workload</h2>
          <div className="space-y-3">
            {staffList?.map(s => {
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

      {/* Modals */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-foreground mb-2">Remove Staff Member?</h3>
            <p className="text-sm text-muted-foreground mb-4">Their name will remain on existing engagements.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm border border-input rounded-md text-foreground hover:bg-muted">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 disabled:opacity-60">
                {deleteMutation.isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoleManager && (
        <RoleManagerModal
          roles={customRoles ?? []}
          onClose={() => setShowRoleManager(false)}
          onSave={(roles) => saveRolesMutation.mutate(roles)}
        />
      )}

      {showImport && (
        <ExcelImportModal
          roles={effectiveRoles}
          onClose={() => setShowImport(false)}
          onImport={(rows) => importMutation.mutate(rows)}
          pending={importMutation.isPending}
        />
      )}

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
          roles={effectiveRoles}
        />
      )}
    </div>
  );
}