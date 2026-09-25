import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { Plus, X, UserPlus, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/leads")({
  head: () => ({ meta: [{ title: "Leads — Firmora" }] }),
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
const STATUSES = ["New", "Qualifying", "Proposal Sent", "Converted", "Lost", "Cold-Closed"];

// Kanban pipeline — stored `status` value on the left, board column label on the right.
// "Converted" is kept as the stored value (not renamed) so it stays compatible with
// the existing convert-to-client flow and the dashboard's open-leads count.
const KANBAN_STAGES: { key: string; label: string }[] = [
  { key: "New", label: "New Enquiry" },
  { key: "Qualifying", label: "AI Qualifying" },
  { key: "Proposal Sent", label: "Proposal Sent" },
  { key: "Converted", label: "Won — Onboarding" },
];

const CLOSED_STATUSES = ["Lost", "Cold-Closed"];

const statusColors: Record<string, string> = {
  New: "bg-primary/10 text-primary",
  Qualifying: "bg-yellow-100 text-yellow-800",
  "Proposal Sent": "bg-purple-100 text-purple-800",
  Converted: "bg-green-100 text-green-800",
  Lost: "bg-muted text-foreground",
  "Cold-Closed": "bg-muted text-foreground",
};

// Rough fee estimate by keyword match against the free-text `requirement`
// field — there's no fee/amount column on leads, so this is a display-only
// heuristic to help prioritize the board, not a quoted or invoiced amount.
const FEE_ESTIMATES: [string, [number, number]][] = [
  ["gst registration", [3000, 6000]],
  ["gst annual", [6000, 15000]],
  ["gst return", [2000, 5000]],
  ["gst", [2000, 6000]],
  ["itr", [1500, 8000]],
  ["income tax", [1500, 8000]],
  ["tax audit", [15000, 30000]],
  ["statutory audit", [35000, 75000]],
  ["audit", [15000, 40000]],
  ["incorporation", [8000, 20000]],
  ["company registration", [8000, 20000]],
  ["llp", [8000, 20000]],
  ["tds", [3000, 8000]],
  ["roc", [8000, 20000]],
  ["bookkeeping", [5000, 15000]],
  ["accounting", [5000, 15000]],
  ["notice", [8000, 25000]],
  ["valuation", [15000, 30000]],
];

function estimateFeeRange(requirement: string | null): string {
  if (!requirement) return "—";
  const lower = requirement.toLowerCase();
  const match = FEE_ESTIMATES.find(([keyword]) => lower.includes(keyword));
  const [min, max] = match ? match[1] : [5000, 15000];
  const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);
  return `₹${fmt(min)}–${fmt(max)}`;
}

function LeadsPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; lead?: Lead | null } | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [showClosed, setShowClosed] = useState(false);

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

  const closedLeads = (leads ?? []).filter((l) => CLOSED_STATUSES.includes(l.status));

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
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground text-sm">Track and convert your sales leads</p>
        </div>
        <button
          onClick={() => setModalState({ mode: "create" })}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading leads...</p>}

      {!isLoading && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {KANBAN_STAGES.map((stage) => {
            const stageLeads = (leads ?? []).filter((l) => l.status === stage.key);
            return (
              <div
                key={stage.key}
                className="w-72 md:w-80 flex-shrink-0 rounded-lg border border-border bg-muted/40 flex flex-col max-h-[calc(100vh-14rem)]"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">{stage.label}</h2>
                  <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-card border border-border text-xs font-medium text-muted-foreground">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {stageLeads.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">No leads here.</p>
                  )}
                  {stageLeads.map((l) => (
                    <LeadCard
                      key={l.id}
                      lead={l}
                      onEdit={() => setModalState({ mode: "edit", lead: l })}
                      onConvert={() => setConvertLead(l)}
                      onMove={(status) => updateMutation.mutate({ id: l.id, payload: { status } })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {closedLeads.length > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-sm">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
          >
            <span className="flex items-center gap-2">
              {showClosed ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Lost / Cold-Closed
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {closedLeads.length}
              </span>
            </span>
          </button>
          {showClosed && (
            <div className="border-t border-border p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {closedLeads.map((l) => (
                <LeadCard
                  key={l.id}
                  lead={l}
                  onEdit={() => setModalState({ mode: "edit", lead: l })}
                  onConvert={() => setConvertLead(l)}
                  onMove={(status) => updateMutation.mutate({ id: l.id, payload: { status } })}
                />
              ))}
            </div>
          )}
        </div>
      )}

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

function LeadCard({
  lead,
  onEdit,
  onConvert,
  onMove,
}: {
  lead: Lead;
  onEdit: () => void;
  onConvert: () => void;
  onMove: (status: string) => void;
}) {
  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground text-sm leading-tight">{lead.name}</p>
        <button
          type="button"
          onClick={onEdit}
          title="Edit lead"
          className="shrink-0 p-1 -m-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil size={13} />
        </button>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2">{lead.requirement || "—"}</p>

      <div className="flex items-center flex-wrap gap-1.5">
        {lead.source && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
            {lead.source}
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
          {estimateFeeRange(lead.requirement)}
        </span>
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
        <span>{formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}</span>
        {lead.status !== "Converted" && (
          <button
            type="button"
            onClick={onConvert}
            className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
          >
            <UserPlus size={12} /> Convert
          </button>
        )}
      </div>

      <select
        value={lead.status}
        onChange={(e) => onMove(e.target.value)}
        className={`w-full mt-1 rounded-md border-0 px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer ${statusColors[lead.status] ?? "bg-muted text-foreground"}`}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
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
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{mode === "edit" ? "Edit Lead" : "Add Lead"}</h2>
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
            <label className="block text-sm font-medium text-foreground mb-1">Name <span className="text-red-500">*</span></label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Urgency</label>
              <select
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {URGENCIES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Qualification Score</label>
            <select
              value={form.qualification_score}
              onChange={(e) => setForm({ ...form, qualification_score: e.target.value })}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="Hot">Hot</option>
              <option value="Warm">Warm</option>
              <option value="Cold">Cold</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Requirement</label>
            <input
              value={form.requirement}
              onChange={(e) => setForm({ ...form, requirement: e.target.value })}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Business Type</label>
            <input
              value={form.business_type}
              onChange={(e) => setForm({ ...form, business_type: e.target.value })}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Convert Lead to Client</h2>
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
          <p className="text-sm text-muted-foreground">
            This will create a new client and mark the lead as <span className="font-medium text-green-700">Converted</span>.
          </p>
          {(["name", "firm_name", "email", "phone"] as const).map((f) => (
            <div key={f}>
              <label className="block text-sm font-medium text-foreground mb-1 capitalize">
                {f.replace("_", " ")}
                {f === "name" && <span className="text-red-500"> *</span>}
              </label>
              <input
                required={f === "name"}
                type={f === "email" ? "email" : "text"}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Converting..." : "Convert to Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
