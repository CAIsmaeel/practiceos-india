import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { useState } from "react";
import { Plus, X, UserPlus, Pencil, ChevronDown, ChevronRight, MessageCircle, Phone, Clock } from "lucide-react";
import { formatDistanceToNow, differenceInDays, format } from "date-fns";

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
  proposal_sent_at?: string | null;
  created_at: string;
};

const SOURCES = ["WhatsApp", "Website", "Email", "Referral", "Walk-in", "Other"];
const URGENCIES = ["High", "Medium", "Low"];
const STATUSES = ["New", "Contacting", "Proposal Sent", "Converted", "Lost", "Cold-Closed"];

const KANBAN_STAGES: { key: string; label: string; hint: string }[] = [
  { key: "New",           label: "New Enquiry",    hint: "Just came in" },
  { key: "Contacting",    label: "Contacting",     hint: "CA reaching out" },
  { key: "Proposal Sent", label: "Proposal Sent",  hint: "Quote sent, awaiting reply" },
  { key: "Converted",     label: "Won 🎉",         hint: "Converted to client" },
];

const CLOSED_STATUSES = ["Lost", "Cold-Closed"];

// ── Auto-score logic ────────────────────────────────────────────────────────
function autoScore(lead: Partial<Lead>): "Hot" | "Warm" | "Cold" {
  const req = (lead.requirement ?? "").toLowerCase();
  const urgentWords = ["urgent", "notice", "penalty", "demand", "raid", "survey", "immediate", "asap", "today"];
  const hasUrgentWord = urgentWords.some(w => req.includes(w));
  const ageDays = lead.created_at ? differenceInDays(new Date(), new Date(lead.created_at)) : 0;

  if (lead.urgency === "High" || hasUrgentWord || lead.source === "WhatsApp") return "Hot";
  if (ageDays > 7 || lead.urgency === "Low") return "Cold";
  return "Warm";
}

// ── Fee estimate ─────────────────────────────────────────────────────────────
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
  const match = FEE_ESTIMATES.find(([k]) => lower.includes(k));
  const [min, max] = match ? match[1] : [5000, 15000];
  const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);
  return `₹${fmt(min)}–${fmt(max)}`;
}

// ── Lead age color ───────────────────────────────────────────────────────────
function ageMeta(created_at: string): { label: string; color: string } {
  const days = differenceInDays(new Date(), new Date(created_at));
  if (days <= 2) return { label: days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days}d ago`, color: "text-green-600" };
  if (days <= 7) return { label: `${days}d ago`, color: "text-amber-600" };
  return { label: `${days}d ago`, color: "text-red-500" };
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: string | null }) {
  if (!score) return null;
  const map: Record<string, { label: string; cls: string }> = {
    Hot:  { label: "🔥 Hot",  cls: "bg-red-100 text-red-700 border border-red-200" },
    Warm: { label: "🌤 Warm", cls: "bg-orange-100 text-orange-700 border border-orange-200" },
    Cold: { label: "❄️ Cold", cls: "bg-blue-100 text-blue-700 border border-blue-200" },
  };
  const m = map[score] ?? { label: score, cls: "bg-muted text-muted-foreground" };
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>;
}

// ── Lead Card ─────────────────────────────────────────────────────────────────
function LeadCard({ lead, onEdit, onConvert, onMove }: {
  lead: Lead; onEdit: () => void; onConvert: () => void; onMove: (status: string) => void;
}) {
  const score = lead.qualification_score ?? autoScore(lead);
  const age = ageMeta(lead.created_at);
  const isHot = score === "Hot";
  const proposalDays = lead.proposal_sent_at
    ? differenceInDays(new Date(), new Date(lead.proposal_sent_at))
    : null;

  const openWA = () => {
    const p = lead.phone?.replace(/\D/g, "") ?? "";
    const msg = encodeURIComponent(`Hi ${lead.name}, thank you for reaching out. We'd love to understand your requirement better — when's a good time to connect?`);
    window.open(p ? `https://wa.me/91${p}?text=${msg}` : `https://wa.me/`, "_blank");
  };

  return (
    <div className={`bg-card border rounded-lg shadow-sm p-3 space-y-2.5 transition-all ${isHot ? "border-red-300 shadow-red-100" : "border-border"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-semibold text-foreground text-sm leading-tight">{lead.name}</p>
            <ScoreBadge score={score} />
          </div>
          {lead.phone && (
            <div className="flex items-center gap-1 mt-0.5">
              <Phone size={10} className="text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{lead.phone}</span>
            </div>
          )}
        </div>
        <button onClick={onEdit} className="shrink-0 p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground">
          <Pencil size={13} />
        </button>
      </div>

      {/* Requirement */}
      <p className="text-xs text-muted-foreground line-clamp-2">{lead.requirement || "—"}</p>

      {/* Tags */}
      <div className="flex items-center flex-wrap gap-1.5">
        {lead.source && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">{lead.source}</span>
        )}
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">{estimateFeeRange(lead.requirement)}</span>
        {lead.urgency && lead.urgency !== "Medium" && (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${lead.urgency === "High" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
            {lead.urgency} urgency
          </span>
        )}
      </div>

      {/* Proposal follow-up warning */}
      {lead.status === "Proposal Sent" && proposalDays !== null && proposalDays >= 3 && (
        <div className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md ${proposalDays >= 7 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
          <Clock size={11} />
          Proposal sent {proposalDays}d ago — follow up!
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-0.5">
        <span className={`text-[11px] font-medium ${age.color}`}>{age.label}</span>
        <div className="flex items-center gap-1.5">
          {lead.phone && (
            <button onClick={openWA} className="inline-flex items-center gap-1 text-[11px] text-green-700 border border-green-200 px-1.5 py-0.5 rounded-md font-medium hover:bg-green-50">
              <MessageCircle size={11} /> WA
            </button>
          )}
          {lead.status !== "Converted" && (
            <button onClick={onConvert} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium">
              <UserPlus size={11} /> Convert
            </button>
          )}
        </div>
      </div>

      {/* Status selector */}
      <select
        value={lead.status}
        onChange={(e) => onMove(e.target.value)}
        className="w-full rounded-md border border-input px-2 py-1 text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-ring bg-muted text-foreground cursor-pointer"
      >
        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

// ── Leads Page ────────────────────────────────────────────────────────────────
function LeadsPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; lead?: Lead | null } | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.from("leads").select("*")
        .eq("user_id", userId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Partial<Lead>) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("leads").insert({ ...payload, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setModalState(null); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Lead> }) => {
      const { error } = await supabase.from("leads").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); setModalState(null); },
  });

  const convertMutation = useMutation({
    mutationFn: async ({ client, leadId }: { client: any; leadId: string }) => {
      const userId = await getCurrentUserId();
      const { error: e1 } = await supabase.from("clients").insert({ ...client, user_id: userId });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("leads").update({ status: "Converted" }).eq("id", leadId);
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

  const handleMove = (lead: Lead, newStatus: string) => {
    const payload: Partial<Lead> = { status: newStatus };
    if (newStatus === "Proposal Sent" && lead.status !== "Proposal Sent") {
      payload.proposal_sent_at = new Date().toISOString();
    }
    updateMutation.mutate({ id: lead.id, payload });
  };

  // Summary stats
  const allLeads = leads ?? [];
  const hotCount = allLeads.filter(l => (l.qualification_score ?? autoScore(l)) === "Hot" && !CLOSED_STATUSES.includes(l.status)).length;
  const proposalPending = allLeads.filter(l => l.status === "Proposal Sent").length;
  const closedLeads = allLeads.filter(l => CLOSED_STATUSES.includes(l.status));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-muted-foreground text-sm">Track and convert your sales pipeline</p>
        </div>
        <button
          onClick={() => setModalState({ mode: "create" })}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {/* Quick stats */}
      {allLeads.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <p className="text-2xl font-bold text-red-600">{hotCount}</p>
            <p className="text-xs text-muted-foreground mt-1">🔥 Hot leads</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <p className="text-2xl font-bold text-purple-600">{proposalPending}</p>
            <p className="text-xs text-muted-foreground mt-1">📋 Awaiting reply</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <p className="text-2xl font-bold text-green-600">
              {allLeads.filter(l => l.status === "Converted").length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">✅ Converted</p>
          </div>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading leads...</p>}

      {/* Kanban */}
      {!isLoading && (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {KANBAN_STAGES.map(stage => {
            const stageLeads = allLeads.filter(l => l.status === stage.key);
            // Sort: Hot first, then by age
            const sorted = [...stageLeads].sort((a, b) => {
              const sa = (a.qualification_score ?? autoScore(a)) === "Hot" ? 0 : 1;
              const sb = (b.qualification_score ?? autoScore(b)) === "Hot" ? 0 : 1;
              return sa - sb;
            });

            return (
              <div key={stage.key} className="w-72 md:w-80 flex-shrink-0 rounded-lg border border-border bg-muted/40 flex flex-col max-h-[calc(100vh-18rem)]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{stage.label}</h2>
                    <p className="text-[10px] text-muted-foreground">{stage.hint}</p>
                  </div>
                  <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-card border border-border text-xs font-medium text-muted-foreground">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {sorted.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">No leads here.</p>
                  )}
                  {sorted.map(l => (
                    <LeadCard
                      key={l.id} lead={l}
                      onEdit={() => setModalState({ mode: "edit", lead: l })}
                      onConvert={() => setConvertLead(l)}
                      onMove={(status) => handleMove(l, status)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Closed leads */}
      {closedLeads.length > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-sm">
          <button
            type="button"
            onClick={() => setShowClosed(v => !v)}
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
              {closedLeads.map(l => (
                <LeadCard
                  key={l.id} lead={l}
                  onEdit={() => setModalState({ mode: "edit", lead: l })}
                  onConvert={() => setConvertLead(l)}
                  onMove={(status) => handleMove(l, status)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit modal */}
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

      {/* Convert modal */}
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

// ── Lead Modal ────────────────────────────────────────────────────────────────
function LeadModal({ mode, initialLead, onClose, onSubmit, pending }: {
  mode: "create" | "edit"; initialLead?: Lead | null;
  onClose: () => void; onSubmit: (data: any) => void; pending: boolean;
}) {
  const suggested = initialLead ? autoScore(initialLead) : "Warm";
  const [form, setForm] = useState({
    name: initialLead?.name ?? "",
    phone: initialLead?.phone ?? "",
    email: initialLead?.email ?? "",
    source: initialLead?.source ?? "WhatsApp",
    requirement: initialLead?.requirement ?? "",
    business_type: initialLead?.business_type ?? "",
    urgency: initialLead?.urgency ?? "Medium",
    qualification_score: initialLead?.qualification_score ?? suggested,
    notes: initialLead?.notes ?? "",
  });

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background";

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
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputClass} />
            </div>
          </div>

          {/* Source + Urgency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Source</label>
              <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className={inputClass}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Urgency</label>
              <select value={form.urgency} onChange={e => setForm({ ...form, urgency: e.target.value })} className={inputClass}>
                {URGENCIES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Score with auto-suggest */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Qualification Score
              <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                (suggested: {autoScore({ ...form, created_at: initialLead?.created_at ?? new Date().toISOString() })})
              </span>
            </label>
            <select value={form.qualification_score} onChange={e => setForm({ ...form, qualification_score: e.target.value })} className={inputClass}>
              <option value="Hot">🔥 Hot</option>
              <option value="Warm">🌤 Warm</option>
              <option value="Cold">❄️ Cold</option>
            </select>
          </div>

          {/* Requirement */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Requirement</label>
            <input value={form.requirement} onChange={e => setForm({ ...form, requirement: e.target.value })} className={inputClass} placeholder="e.g. GST registration, ITR filing" />
            {form.requirement && (
              <p className="text-xs text-muted-foreground mt-1">
                Estimated fee: <strong>{estimateFeeRange(form.requirement)}</strong>
              </p>
            )}
          </div>

          {/* Business type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Business Type</label>
            <input value={form.business_type} onChange={e => setForm({ ...form, business_type: e.target.value })} className={inputClass} placeholder="e.g. Proprietorship, Pvt Ltd" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className={inputClass} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update Lead" : "Save Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Convert Modal ─────────────────────────────────────────────────────────────
function ConvertModal({ lead, onClose, onSubmit, pending }: {
  lead: Lead; onClose: () => void;
  onSubmit: (client: { name: string; firm_name: string | null; email: string | null; phone: string | null }) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    name: lead.name,
    firm_name: lead.business_type ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
  });

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background";

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
            onSubmit({ name: form.name, firm_name: form.firm_name || null, email: form.email || null, phone: form.phone || null });
          }}
          className="p-5 space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            This will create a new client and mark the lead as <span className="font-medium text-green-700">Converted</span>.
          </p>
          {(["name", "firm_name", "email", "phone"] as const).map(f => (
            <div key={f}>
              <label className="block text-sm font-medium text-foreground mb-1 capitalize">
                {f.replace("_", " ")}{f === "name" && <span className="text-red-500"> *</span>}
              </label>
              <input
                required={f === "name"} type={f === "email" ? "email" : "text"}
                value={form[f]} onChange={e => setForm({ ...form, [f]: e.target.value })}
                className={inputClass}
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Converting..." : "Convert to Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
