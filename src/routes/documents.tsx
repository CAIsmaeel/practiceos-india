import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, getCurrentUserId } from "@/lib/supabase";
import { useState } from "react";
import {
  Plus, X, CheckCircle2, Trash2, MessageCircle, ChevronDown, ChevronRight,
  Search, Users, FileText, AlertCircle, Bell,
} from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/documents")({
  head: () => ({ meta: [{ title: "Documents — Firmora" }] }),
  component: DocumentsPage,
});

type DocStatus = "pending" | "received" | "not_applicable";

type DocRow = {
  id: string;
  engagement_id: string;
  doc_name: string;
  requirement: string;
  status: DocStatus;
  sort_order: number;
  received_at: string | null;
  remarks: string | null;
};

type OldRequest = {
  id: string;
  client_id: string;
  engagement_id: string | null;
  document_name: string;
  status: string;
  requested_date: string;
  received_date: string | null;
  followup_count: number;
  clients?: { name: string; firm_name: string | null } | null;
  engagements?: { title: string } | null;
};

type EngGroup = { eng: any; docs: DocRow[] };

type ClientGroup = {
  clientId: string;
  name: string;
  engs: EngGroup[];
  pendingCount: number;
  mandatoryPending: number;
  earliestDeadline: string | null;
  lastReminder: string | null;
  totalReminders: number;
};

const isActive = (e: any) => e.status !== "completed" && e.status !== "billed";
const fmt = (d: string) => format(new Date(d), "dd MMM yyyy");

function isOverdue(d?: string | null) {
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(d) < today;
}

function cleanPhone(raw?: string | null) {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d;
}

function buildClientMessage(g: ClientGroup, firmName: string) {
  const lines: string[] = [
    `Dear ${g.name},`,
    "",
    "Hope you are doing well. To complete your work with us, we still need the following documents:",
  ];
  g.engs.forEach(({ eng, docs }) => {
    const pending = docs.filter((d) => d.status === "pending");
    if (pending.length === 0) return;
    lines.push("");
    lines.push(`*${eng.title} (${eng.type})*${eng.deadline ? ` — target: ${fmt(eng.deadline)}` : ""}`);
    pending.forEach((d, i) => {
      const note = d.remarks ? ` [Note: ${d.remarks}]` : "";
      lines.push(`${i + 1}. ${d.doc_name}${d.requirement === "optional" ? " (if applicable)" : ""}${note}`);
    });
  });
  lines.push(
    "",
    "Please share these at your convenience so we can complete everything on time.",
    "If any item does not apply to you, just let us know.",
    "",
    "Thank you!",
    firmName,
  );
  return lines.join("\n").trim();
}

function DocumentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [requestOpen, setRequestOpen] = useState(false);
  const [showOldReceived, setShowOldReceived] = useState(false);
  const [editingRemark, setEditingRemark] = useState<string | null>(null);
  const [remarkDraft, setRemarkDraft] = useState("");

  const { data: engagements, isLoading: engLoading } = useQuery({
    queryKey: ["engagements"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("engagements")
        .select("*, clients!inner(name, firm_name, status)")
        .eq("user_id", userId ?? "")
        .neq("clients.status", "deleted")
        .neq("clients.status", "archived")
        .order("deadline", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ["engagement-docs"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("engagement_documents")
        .select("id, engagement_id, doc_name, requirement, status, sort_order, received_at, remarks")
        .eq("user_id", userId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-for-select"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId ?? "")
        .order("name");
      return (data ?? []) as any[];
    },
  });

  const { data: firmName } = useQuery({
    queryKey: ["firm-name"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase
        .from("settings")
        .select("firm_name")
        .eq("user_id", userId ?? "")
        .limit(1)
        .maybeSingle();
      return ((data as any)?.firm_name as string) ?? "";
    },
  });

  const { data: oldRequests } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("documents")
        .select("*, clients(name, firm_name), engagements(title)")
        .eq("user_id", userId ?? "")
        .order("requested_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OldRequest[];
    },
  });

  const engMap: Record<string, any> = {};
  (engagements ?? []).forEach((e) => { engMap[e.id] = e; });

  const clientMap: Record<string, any> = {};
  (clients ?? []).forEach((c) => { clientMap[c.id] = c; });

  const groupsById: Record<string, { name: string; engs: Record<string, EngGroup> }> = {};
  (docs ?? []).forEach((d) => {
    if (d.status !== "pending") return;
    const eng = engMap[d.engagement_id];
    if (!eng || !isActive(eng)) return;
    const cid = eng.client_id;
    const g = (groupsById[cid] ??= {
      name: eng.clients?.name ?? clientMap[cid]?.name ?? "—",
      engs: {},
    });
    (g.engs[eng.id] ??= { eng, docs: [] }).docs.push(d);
  });

  const allGroups: ClientGroup[] = Object.entries(groupsById).map(([clientId, g]) => {
    const engs = Object.values(g.engs).sort((a, b) =>
      (a.eng.deadline ?? "9999").localeCompare(b.eng.deadline ?? "9999")
    );
    const allDocs = engs.flatMap((x) => x.docs);
    const deadlines = engs.map((x) => x.eng.deadline).filter(Boolean) as string[];
    const reminders = engs.map((x) => x.eng.last_reminder_date).filter(Boolean) as string[];
    const totalReminders = engs.reduce((n, x) => n + (x.eng.reminder_count ?? 0), 0);
    return {
      clientId,
      name: g.name,
      engs,
      pendingCount: allDocs.length,
      mandatoryPending: allDocs.filter((d) => d.requirement === "mandatory").length,
      earliestDeadline: deadlines.sort()[0] ?? null,
      lastReminder: reminders.sort().reverse()[0] ?? null,
      totalReminders,
    };
  });

  allGroups.sort(
    (a, b) =>
      b.mandatoryPending - a.mandatoryPending ||
      (a.earliestDeadline ?? "9999").localeCompare(b.earliestDeadline ?? "9999")
  );

  const groups = allGroups.filter((g) =>
    g.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const totals = {
    clients: allGroups.length,
    pending: allGroups.reduce((n, g) => n + g.pendingCount, 0),
    mandatory: allGroups.reduce((n, g) => n + g.mandatoryPending, 0),
    blocked: allGroups.reduce(
      (n, g) => n + g.engs.filter((x) => x.docs.some((d) => d.requirement === "mandatory")).length,
      0
    ),
  };

  const oldVisible = (oldRequests ?? []).filter((r) => showOldReceived || r.status !== "received");
  const oldPendingCount = (oldRequests ?? []).filter((r) => r.status !== "received").length;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["engagement-docs"] });
    qc.invalidateQueries({ queryKey: ["engagements"] });
    qc.invalidateQueries({ queryKey: ["engagements-all"] });
  };

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DocStatus }) => {
      const { error } = await supabase
        .from("engagement_documents")
        .update({ status, received_at: status === "received" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engagement-docs"] }),
    onError: (err: any) => alert("Could not update document: " + (err?.message ?? "")),
  });

  const updateRemarkMutation = useMutation({
    mutationFn: async ({ id, remarks }: { id: string; remarks: string }) => {
      const { error } = await supabase
        .from("engagement_documents")
        .update({ remarks: remarks.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["engagement-docs"] });
      setEditingRemark(null);
    },
    onError: (err: any) => alert("Could not save remark: " + (err?.message ?? "")),
  });

  const addDocsMutation = useMutation({
    mutationFn: async (p: {
      engagementId: string;
      clientId: string;
      names: string[];
      requirement: "mandatory" | "optional";
    }) => {
      const userId = await getCurrentUserId();
      const rows = p.names.map((doc_name, i) => ({
        user_id: userId,
        engagement_id: p.engagementId,
        client_id: p.clientId,
        doc_name,
        requirement: p.requirement,
        status: "pending",
        sort_order: 1000 + i,
      }));
      const { error } = await supabase
        .from("engagement_documents")
        .upsert(rows, { onConflict: "engagement_id,doc_name", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setRequestOpen(false);
    },
    onError: (err: any) => alert("Could not add documents: " + (err?.message ?? "")),
  });

  const receiveOldMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from("documents")
        .update({ status: "received", received_date: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
    onError: (err: any) => alert("Could not update request: " + (err?.message ?? "")),
  });

  const chaseClient = async (g: ClientGroup) => {
    const client = clientMap[g.clientId];
    const phone = cleanPhone(client?.phone ?? client?.mobile ?? client?.whatsapp);
    const msg = encodeURIComponent(buildClientMessage(g, firmName ?? ""));
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");

    const now = new Date().toISOString();
    const results = await Promise.all(
      g.engs.map(({ eng }) =>
        supabase
          .from("engagements")
          .update({ reminder_count: (eng.reminder_count ?? 0) + 1, last_reminder_date: now })
          .eq("id", eng.id)
      )
    );
    results.forEach((r) => { if (r.error) console.error(r.error); });
    invalidateAll();
  };

  const startRemark = (doc: DocRow) => {
    setEditingRemark(doc.id);
    setRemarkDraft(doc.remarks ?? "");
  };

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  const loading = engLoading || docsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="text-muted-foreground text-sm">Pending client documents across all engagements</p>
        </div>
        <button
          onClick={() => setRequestOpen(true)}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Request Documents
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={<Users size={18} />} label="Clients waiting" value={totals.clients}
          className="text-primary bg-primary/5" />
        <SummaryCard icon={<FileText size={18} />} label="Pending documents"
          value={totals.pending} sub={`${totals.mandatory} mandatory`}
          className="text-amber-600 bg-amber-50" />
        <SummaryCard icon={<AlertCircle size={18} />} label="Engagements blocked"
          value={totals.blocked} sub="waiting for mandatory docs"
          className="text-red-600 bg-red-50" />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client..."
          className="w-full border border-input rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Client cards */}
      <div className="space-y-3">
        {loading && (
          <div className="bg-card border border-border rounded-lg px-5 py-8 text-center text-muted-foreground text-sm">Loading...</div>
        )}
        {!loading && groups.length === 0 && (
          <div className="bg-card border border-border rounded-lg px-5 py-8 text-center text-muted-foreground text-sm">
            {search ? "No client matches your search." : "🎉 No pending client documents!"}
          </div>
        )}

        {groups.map((g) => {
          const isOpen = expanded.has(g.clientId);
          return (
            <div key={g.clientId} className="bg-card border border-border rounded-lg shadow-sm">
              {/* Client header */}
              <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
                <button onClick={() => toggle(g.clientId)} className="flex items-center gap-3 text-left min-w-0 flex-1">
                  {isOpen
                    ? <ChevronDown size={18} className="text-muted-foreground shrink-0" />
                    : <ChevronRight size={18} className="text-muted-foreground shrink-0" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{g.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-amber-700 font-medium">{g.pendingCount} pending</span>
                      {" · "}
                      <span className="text-red-600 font-medium">{g.mandatoryPending} mandatory</span>
                      {" · "}
                      {g.engs.length} engagement{g.engs.length > 1 ? "s" : ""}
                      {g.earliestDeadline && (
                        <>
                          {" · "}
                          <span className={isOverdue(g.earliestDeadline) ? "text-red-600 font-medium" : ""}>
                            due {fmt(g.earliestDeadline)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-3">
                  {/* Reminder history */}
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Bell size={12} />
                    {g.totalReminders > 0
                      ? <span>{g.totalReminders} reminder{g.totalReminders > 1 ? "s" : ""}{g.lastReminder ? ` · last ${fmt(g.lastReminder)}` : ""}</span>
                      : <span>No reminder yet</span>}
                  </div>
                  <button
                    onClick={() => void chaseClient(g)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700"
                  >
                    <MessageCircle size={14} /> Chase All
                  </button>
                </div>
              </div>

              {/* Expanded: engagement-wise docs */}
              {isOpen && (
                <div className="border-t border-border divide-y divide-border">
                  {g.engs.map(({ eng, docs: engDocs }) => {
                    const mandatory = engDocs.filter((d) => d.requirement === "mandatory");
                    const optional = engDocs.filter((d) => d.requirement !== "mandatory");
                    return (
                      <div key={eng.id} className="px-5 py-3">
                        <p className="text-sm font-medium text-foreground mb-2">
                          {eng.title}
                          <span className="text-muted-foreground font-normal"> · {eng.type}</span>
                          {eng.deadline && (
                            <span className={`font-normal ${isOverdue(eng.deadline) ? "text-red-600" : "text-muted-foreground"}`}>
                              {" · "}due {fmt(eng.deadline)}
                            </span>
                          )}
                        </p>

                        {/* Mandatory docs */}
                        {mandatory.length > 0 && (
                          <div className="space-y-2">
                            {mandatory.map((d) => (
                              <DocItem
                                key={d.id}
                                doc={d}
                                editingRemark={editingRemark}
                                remarkDraft={remarkDraft}
                                setRemarkDraft={setRemarkDraft}
                                onStartRemark={startRemark}
                                onCancelRemark={() => setEditingRemark(null)}
                                onSaveRemark={(id) => updateRemarkMutation.mutate({ id, remarks: remarkDraft })}
                                onUpdateStatus={(id, status) => updateDocMutation.mutate({ id, status })}
                                updating={updateDocMutation.isPending || updateRemarkMutation.isPending}
                              />
                            ))}
                          </div>
                        )}

                        {/* Conditional/optional docs */}
                        {optional.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                              Conditional / Optional
                            </p>
                            <div className="space-y-2">
                              {optional.map((d) => (
                                <DocItem
                                  key={d.id}
                                  doc={d}
                                  editingRemark={editingRemark}
                                  remarkDraft={remarkDraft}
                                  setRemarkDraft={setRemarkDraft}
                                  onStartRemark={startRemark}
                                  onCancelRemark={() => setEditingRemark(null)}
                                  onSaveRemark={(id) => updateRemarkMutation.mutate({ id, remarks: remarkDraft })}
                                  onUpdateStatus={(id, status) => updateDocMutation.mutate({ id, status })}
                                  updating={updateDocMutation.isPending || updateRemarkMutation.isPending}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Older requests */}
      {(oldPendingCount > 0 || showOldReceived) && (
        <div className="space-y-3 pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Older requests</h2>
              <p className="text-xs text-muted-foreground">
                Created before checklists. New requests now go into the engagement checklist.
              </p>
            </div>
            <button
              onClick={() => setShowOldReceived((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              {showOldReceived ? "Hide received" : "Show received"}
            </button>
          </div>
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-left">
                <tr>
                  <th className="px-5 py-2.5 font-medium text-xs uppercase tracking-wide">Client</th>
                  <th className="px-5 py-2.5 font-medium text-xs uppercase tracking-wide">Document</th>
                  <th className="px-5 py-2.5 font-medium text-xs uppercase tracking-wide">Engagement</th>
                  <th className="px-5 py-2.5 font-medium text-xs uppercase tracking-wide">Requested</th>
                  <th className="px-5 py-2.5 font-medium text-xs uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {oldVisible.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">No older requests.</td></tr>
                )}
                {oldVisible.map((r) => (
                  <tr key={r.id} className="hover:bg-muted">
                    <td className="px-5 py-2.5 font-medium text-foreground">{r.clients?.name ?? "—"}</td>
                    <td className="px-5 py-2.5 text-foreground">{r.document_name}</td>
                    <td className="px-5 py-2.5 text-foreground">{r.engagements?.title ?? "—"}</td>
                    <td className="px-5 py-2.5 text-foreground whitespace-nowrap">
                      {r.requested_date ? fmt(r.requested_date) : "—"}
                    </td>
                    <td className="px-5 py-2.5">
                      {r.status === "received" ? (
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">received</span>
                      ) : (
                        <button
                          onClick={() => receiveOldMutation.mutate({ id: r.id })}
                          disabled={receiveOldMutation.isPending}
                          className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> Mark Received
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {requestOpen && (
        <RequestModal
          clients={clients ?? []}
          engagements={(engagements ?? []).filter(isActive)}
          onClose={() => setRequestOpen(false)}
          onSubmit={(p) => addDocsMutation.mutate(p)}
          pending={addDocsMutation.isPending}
        />
      )}
    </div>
  );
}

// ---------- DocItem ----------

function DocItem({
  doc, editingRemark, remarkDraft, setRemarkDraft,
  onStartRemark, onCancelRemark, onSaveRemark, onUpdateStatus, updating,
}: {
  doc: DocRow;
  editingRemark: string | null;
  remarkDraft: string;
  setRemarkDraft: (v: string) => void;
  onStartRemark: (doc: DocRow) => void;
  onCancelRemark: () => void;
  onSaveRemark: (id: string) => void;
  onUpdateStatus: (id: string, status: DocStatus) => void;
  updating: boolean;
}) {
  const isEditing = editingRemark === doc.id;
  return (
    <div className="pl-3 border-l-2 border-border space-y-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground">{doc.doc_name}</p>
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${
            doc.requirement === "mandatory" ? "text-red-500" : "text-muted-foreground"
          }`}>
            {doc.requirement}
          </span>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            disabled={updating}
            onClick={() => onUpdateStatus(doc.id, "received")}
            className={`px-2 py-1 rounded-md text-xs font-medium border disabled:opacity-60 ${
              doc.status === "received"
                ? "bg-green-100 text-green-800 border-green-300"
                : "bg-card text-green-700 border-green-200 hover:bg-green-50"
            }`}
          >
            Received
          </button>
          <button
            disabled={updating}
            onClick={() => onUpdateStatus(doc.id, "not_applicable")}
            className={`px-2 py-1 rounded-md text-xs font-medium border disabled:opacity-60 ${
              doc.status === "not_applicable"
                ? "bg-slate-200 text-slate-700 border-slate-300"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            N/A
          </button>
        </div>
      </div>

      {/* Remarks */}
      {isEditing ? (
        <div className="flex items-center gap-2 mt-1">
          <input
            autoFocus
            value={remarkDraft}
            onChange={(e) => setRemarkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveRemark(doc.id);
              if (e.key === "Escape") onCancelRemark();
            }}
            placeholder="Add a note (e.g. Client said 2 days)"
            className="flex-1 border border-input rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={() => onSaveRemark(doc.id)}
            className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Save
          </button>
          <button
            onClick={onCancelRemark}
            className="text-xs px-2 py-1 border border-border rounded text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => onStartRemark(doc)}
          className="text-[11px] text-muted-foreground hover:text-foreground mt-0.5 block"
        >
          {doc.remarks
            ? <span>📝 {doc.remarks}</span>
            : <span className="opacity-60">＋ Add note</span>}
        </button>
      )}
    </div>
  );
}

// ---------- Summary card ----------

function SummaryCard({
  icon, label, value, sub, className,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  className: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg shadow-sm p-4 flex items-center gap-3">
      <div className={`p-2 rounded-md ${className}`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ---------- Request modal ----------

function RequestModal({
  clients, engagements, onClose, onSubmit, pending,
}: {
  clients: any[];
  engagements: any[];
  onClose: () => void;
  onSubmit: (p: {
    engagementId: string;
    clientId: string;
    names: string[];
    requirement: "mandatory" | "optional";
  }) => void;
  pending: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [engagementId, setEngagementId] = useState("");
  const [requirement, setRequirement] = useState<"mandatory" | "optional">("mandatory");
  const [docNames, setDocNames] = useState<string[]>([""]);

  const clientIdsWithEng = new Set(engagements.map((e) => e.client_id));
  const selectableClients = clients.filter((c) => clientIdsWithEng.has(c.id));
  const clientEngagements = engagements.filter((e) => e.client_id === clientId);

  const setDocName = (i: number, value: string) => {
    const next = [...docNames];
    next[i] = value;
    setDocNames(next);
  };
  const removeDocName = (i: number) => setDocNames(docNames.filter((_, idx) => idx !== i));

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Request Documents</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const names = Array.from(new Set(docNames.map((n) => n.trim()).filter(Boolean)));
            if (!clientId || !engagementId || names.length === 0) return;
            onSubmit({ engagementId, clientId, names, requirement });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Client <span className="text-red-500">*</span></label>
            <select required value={clientId}
              onChange={(e) => { setClientId(e.target.value); setEngagementId(""); }}
              className={inputClass}>
              <option value="">Select a client</option>
              {selectableClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Engagement <span className="text-red-500">*</span></label>
            <select required value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              disabled={!clientId}
              className={`${inputClass} disabled:bg-muted disabled:text-muted-foreground`}>
              <option value="">{clientId ? "Select an engagement" : "Select a client first"}</option>
              {clientEngagements.map((e) => (
                <option key={e.id} value={e.id}>{e.title} ({e.type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Requirement</label>
            <div className="flex gap-2">
              {(["mandatory", "optional"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRequirement(r)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border capitalize ${
                    requirement === r
                      ? r === "mandatory" ? "bg-red-50 text-red-700 border-red-200" : "bg-muted text-foreground border-input"
                      : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}>
                  {r}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Mandatory documents block the engagement until received.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Document Names <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              {docNames.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input required={i === 0} value={name}
                    onChange={(e) => setDocName(i, e.target.value)}
                    placeholder={`Document ${i + 1}`}
                    className="flex-1 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  {docNames.length > 1 && (
                    <button type="button" onClick={() => removeDocName(i)} className="text-muted-foreground hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setDocNames([...docNames, ""])}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary font-medium">
              <Plus size={14} /> Add another document
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : "Add to Checklist"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}