import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { Plus, X, UserPlus, Pencil } from "lucide-react";

export const Route = createFileRoute("/leads")({
  head: () => ({ meta: [{ title: "Leads — PracticeOS" }] }),
  component: LeadsPage,
});

type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  requirement: string | null;
  business_type: string | null;
  urgency: string | null;
  qualification_score: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const SOURCES = ["WhatsApp", "Website", "Email", "Referral", "Other"];
const URGENCIES = ["High", "Medium", "Low"];
const STATUSES = ["New", "Qualifying", "Converted", "Lost", "Cold-Closed"];

const scoreColors: Record<string, string> = {
  Hot: "bg-red-100 text-red-800",
  Warm: "bg-orange-100 text-orange-800",
  Cold: "bg-gray-100 text-gray-700",
};

const statusColors: Record<string, string> = {
  New: "bg-blue-100 text-blue-800",
  Qualifying: "bg-yellow-100 text-yellow-800",
  Converted: "bg-green-100 text-green-800",
  Lost: "bg-gray-100 text-gray-700",
  "Cold-Closed": "bg-slate-200 text-slate-700",
};

function LeadsPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; lead?: Lead | null } | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [statusFilter, setStatusFilter] = useState("active");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const filtered =
    statusFilter === "all"
      ? leads
      : statusFilter === "active"
        ? leads?.filter(
            (l) => !["Converted", "Lost", "Cold-Closed"].includes(l.status)
          )
        : leads?.filter((l) => l.status === statusFilter);

  const addMutation = useMutation({
    mutationFn: async (payload: Partial<Lead>) => {
      const { error } = await supabase.from("leads").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      setModalState(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Lead> }) => {
      const { error } = await supabase.from("leads").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      setModalState(null);
    },
  });

  const convertMutation = useMutation({
    mutationFn: async ({
      client,
      leadId,
    }: {
      client: { name: string; firm_name: string | null; email: string | null; phone: string | null };
      leadId: string;
    }) => {
      const { error: e1 } = await supabase.from("clients").insert(client);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("leads")
        .update({ status: "Converted" })
        .eq("id", leadId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-count"] });
      qc.invalidateQueries({ queryKey: ["clients-for-select"] });
      setConvertLead(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leads</h1>
          <p className="text-slate-500 text-sm">Track and convert your sales leads</p>
        </div>
        <button
          onClick={() => setModalState({ mode: "create" })}
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Add Lead
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-600 font-medium">Filter:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="active">Active (excl. Converted/Lost/Cold-Closed)</option>
          <option value="all">All Leads</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Source</th>
              <th className="px-5 py-3 font-medium">Requirement</th>
              <th className="px-5 py-3 font-medium">Urgency</th>
              <th className="px-5 py-3 font-medium">Score</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {!isLoading && filtered?.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-500">No leads found.</td></tr>
            )}
            {filtered?.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{l.name}</td>
                <td className="px-5 py-3 text-slate-700">{l.phone ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{l.email ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{l.source ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{l.requirement ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{l.urgency ?? "—"}</td>
                <td className="px-5 py-3">
                  {l.qualification_score ? (
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${scoreColors[l.qualification_score] ?? "bg-gray-100 text-gray-700"}`}>
                      {l.qualification_score}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusColors[l.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {l.status}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModalState({ mode: "edit", lead: l })}
                      className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    {l.status !== "Converted" && (
                      <button
                        onClick={() => setConvertLead(l)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <UserPlus size={14} /> Convert to Client
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
        <LeadModal
          mode={modalState.mode}
          initialLead={modalState.lead ?? undefined}
          onClose={() => setModalState(null)}
          onSubmit={(payload) => {
            if (modalState.mode === "edit" && modalState.lead?.id) {
              updateMutation.mutate({ id: modalState.lead.id, payload });
              return;
            }
            addMutation.mutate(payload);
          }}
          pending={addMutation.isPending || updateMutation.isPending}
        />
      )}
      {convertLead && (
        <ConvertModal
          lead={convertLead}
          onClose={() => setConvertLead(null)}
          onSubmit={(client) => convertMutation.mutate({ client, leadId: convertLead.id })}
          pending={convertMutation.isPending}
        />
      )}
    </div>
  );
}

function LeadModal({
  mode,
  initialLead,
  onClose,
  onSubmit,
  pending,
}: {
  mode: "create" | "edit";
  initialLead?: Lead | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    name: initialLead?.name ?? "",
    phone: initialLead?.phone ?? "",
    email: initialLead?.email ?? "",
    source: initialLead?.source ?? "WhatsApp",
    requirement: initialLead?.requirement ?? "",
    business_type: initialLead?.business_type ?? "",
    urgency: initialLead?.urgency ?? "Medium",
    qualification_score: initialLead?.qualification_score ?? "Warm",
    notes: initialLead?.notes ?? "",
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">{mode === "edit" ? "Edit Lead" : "Add Lead"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ ...form, status: mode === "edit" ? initialLead?.status ?? "New" : "New" });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Urgency</label>
              <select
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Qualification Score</label>
            <select
              value={form.qualification_score}
              onChange={(e) => setForm({ ...form, qualification_score: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Hot">Hot</option>
              <option value="Warm">Warm</option>
              <option value="Cold">Cold</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Requirement</label>
            <input
              value={form.requirement}
              onChange={(e) => setForm({ ...form, requirement: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Business Type</label>
            <input
              value={form.business_type}
              onChange={(e) => setForm({ ...form, business_type: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
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
              {pending ? "Saving..." : mode === "edit" ? "Update Lead" : "Save Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConvertModal({
  lead,
  onClose,
  onSubmit,
  pending,
}: {
  lead: Lead;
  onClose: () => void;
  onSubmit: (client: { name: string; firm_name: string | null; email: string | null; phone: string | null }) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    name: lead.name,
    firm_name: lead.business_type ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Convert Lead to Client</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              name: form.name,
              firm_name: form.firm_name || null,
              email: form.email || null,
              phone: form.phone || null,
            });
          }}
          className="p-5 space-y-4"
        >
          <p className="text-sm text-slate-500">
            This will create a new client and mark the lead as <span className="font-medium text-green-700">Converted</span>.
          </p>
          {(["name", "firm_name", "email", "phone"] as const).map((f) => (
            <div key={f}>
              <label className="block text-sm font-medium text-slate-700 mb-1 capitalize">
                {f.replace("_", " ")}
                {f === "name" && <span className="text-red-500"> *</span>}
              </label>
              <input
                required={f === "name"}
                type={f === "email" ? "email" : "text"}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {pending ? "Converting..." : "Convert to Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
