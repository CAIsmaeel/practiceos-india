import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Client } from "@/lib/supabase";
import { useState, useRef, useEffect } from "react";
import { Plus, X, MoreVertical } from "lucide-react";

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Clients — PracticeOS" }] }),
  component: ClientsPage,
});

type FilterType = "active" | "inactive" | "archived" | "deleted";

const CLIENT_TYPES = [
  "Individual","Proprietorship","Partnership",
  "Private Limited","Public Limited","LLP","Trust","HUF",
];

function ClientsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>("active");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients", filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("status", filter)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase
        .from("clients")
        .insert({ ...payload, status: "active" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("clients")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const filterButtons: { label: string; value: FilterType }[] = [
    { label: "All Active", value: "active" },
    { label: "Inactive", value: "inactive" },
    { label: "Archived", value: "archived" },
    { label: "Show Deleted", value: "deleted" },
  ];

  const statusDot: Record<FilterType, string> = {
    active: "bg-green-500",
    inactive: "bg-gray-400",
    archived: "bg-yellow-500",
    deleted: "bg-red-500",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm">Manage your client list</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Add Client
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex gap-2 flex-wrap">
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setFilter(btn.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              filter === btn.value
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Firm Name</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">PAN</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && clients?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  No clients found.
                </td>
              </tr>
            )}
            {clients?.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        statusDot[c.status as FilterType] ?? "bg-gray-400"
                      }`}
                    />
                    {c.name}
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-700">{c.firm_name ?? "—"}</td>
                <td className="px-5 py-3">
                  {c.client_type ? (
                    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                      {c.client_type}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-5 py-3 text-slate-700 font-mono text-xs">
                  {c.pan_number ?? "—"}
                </td>
                <td className="px-5 py-3 text-slate-700">{c.phone ?? "—"}</td>
                <td className="px-5 py-3">
                  <RowMenu
                    status={c.status}
                    onAction={(action) =>
                      updateStatusMutation.mutate({ id: c.id, status: action })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <ClientModal
          onClose={() => setOpen(false)}
          onSubmit={addMutation.mutate}
          pending={addMutation.isPending}
        />
      )}
    </div>
  );
}

/* Three-dot menu */
function RowMenu({
  status,
  onAction,
}: {
  status: string;
  onAction: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="p-1 rounded hover:bg-slate-100 text-slate-500"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1">
          {status !== "inactive" && (
            <button
              onClick={() => { onAction("inactive"); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Set Inactive
            </button>
          )}
          {status !== "archived" && (
            <button
              onClick={() => { onAction("archived"); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Archive
            </button>
          )}
          {status !== "active" && (
            <button
              onClick={() => { onAction("active"); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50"
            >
              Restore
            </button>
          )}
          {status !== "deleted" && (
            <button
              onClick={() => { onAction("deleted"); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* Add Client Modal */
function ClientModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    name: "", firm_name: "", email: "", phone: "",
    pan_number: "", gst_number: "", whatsapp_number: "",
    client_type: "", notes: "",
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-900">Add Client</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
          className="p-5 space-y-5"
        >
          {/* Basic Info */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Basic Info
            </p>
            <div className="space-y-3">
              <Field label="Name *" required>
                <input required value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="input" />
              </Field>
              <Field label="Firm Name">
                <input value={form.firm_name}
                  onChange={(e) => set("firm_name", e.target.value)}
                  className="input" />
              </Field>
              <Field label="Email">
                <input type="email" value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="input" />
              </Field>
              <Field label="Phone">
                <input value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className="input" />
              </Field>
            </div>
          </div>

          {/* Tax Details */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Tax Details
            </p>
            <div className="space-y-3">
              <Field label="PAN Number">
                <input
                  maxLength={10}
                  value={form.pan_number}
                  onChange={(e) => set("pan_number", e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className="input font-mono" />
              </Field>
              <Field label="GST Number">
                <input
                  maxLength={15}
                  value={form.gst_number}
                  onChange={(e) => set("gst_number", e.target.value.toUpperCase())}
                  placeholder="22ABCDE1234F1Z5"
                  className="input font-mono" />
              </Field>
              <Field label="Client Type">
                <select
                  value={form.client_type}
                  onChange={(e) => set("client_type", e.target.value)}
                  className="input"
                >
                  <option value="">Select type...</option>
                  {CLIENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Contact Details
            </p>
            <div className="space-y-3">
              <Field label="WhatsApp Number">
                <input value={form.whatsapp_number}
                  onChange={(e) => set("whatsapp_number", e.target.value)}
                  placeholder="Same as phone if blank"
                  className="input" />
              </Field>
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  className="input resize-none" />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60">
              {pending ? "Saving..." : "Save Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

