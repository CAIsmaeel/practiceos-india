import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Engagement, type Client, getCurrentUserId } from "@/lib/supabase";
import { ENGAGEMENT_TYPES, getTemplate, type EngagementConditions } from "@/lib/checklistTemplates";
import { useTour } from "@/components/Onboarding";
import { useState, useEffect } from "react";
import {
  Plus, X, Archive, Pencil, CheckCircle2, Clock,
  ClipboardList, MessageCircle, AlertCircle, MoreHorizontal, Play, Mail,
} from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/engagements")({
  head: () => ({ meta: [{ title: "Engagements — Firmora" }] }),
  component: EngagementsPage,
});

const STATUSES = ["pending", "in_progress", "ready_for_review", "completed", "billed", "on_hold"];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-primary/10 text-primary",
  ready_for_review: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  billed: "bg-teal-100 text-teal-800",
  on_hold: "bg-muted text-foreground",
};

const CHECKER_ROLES = ["Qualified CA", "Manager", "Partner", "Admin"];

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  started:   { label: "Work started",        color: "text-blue-600" },
  submitted: { label: "Submitted for review", color: "text-purple-600" },
  approved:  { label: "Approved ✓",          color: "text-green-600" },
  rejected:  { label: "Rejected",             color: "text-red-600" },
  on_hold:   { label: "Put on hold",          color: "text-gray-500" },
  resumed:   { label: "Resumed",              color: "text-blue-500" },
};

type DocStatus = "pending" | "received" | "not_applicable";
type DocRow = { id: string; engagement_id: string; doc_name: string; requirement: string; status: DocStatus; sort_order: number; received_at: string | null; };
type HistoryRow = { id: string; action: string; actor_name: string | null; notes: string | null; created_at: string; };

function summarize(docs: DocRow[] = []) {
  const total = docs.length;
  const done = docs.filter(d => d.status !== "pending").length;
  const pendingDocs = docs.filter(d => d.status === "pending");
  const mandatoryPending = pendingDocs.filter(d => d.requirement === "mandatory").length;
  const state: "none" | "pending_docs" | "ready" = total === 0 ? "none" : mandatoryPending > 0 ? "pending_docs" : "ready";
  return { total, done, pendingDocs, pendingCount: pendingDocs.length, mandatoryPending, state };
}

function cleanPhone(raw?: string | null) {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d;
}

function buildChaseMessage(e: any, pendingDocs: DocRow[], clientName: string, firmName: string) {
  return [
    `Dear ${clientName},`,
    "",
    `Hope you are doing well. To complete your ${e.title} (${e.type}), we still need the following:`,
    "",
    ...pendingDocs.map((d, i) => `${i + 1}. ${d.doc_name}${d.requirement === "optional" ? " (if applicable)" : ""}`),
    "",
    e.deadline ? `It would be great to receive these before ${format(new Date(e.deadline), "dd MMM yyyy")} so we can complete the work on time.` : "Please share these at your convenience so we can proceed.",
    "If any item does not apply to you, just let us know.",
    "",
    "Thank you!",
    firmName,
  ].join("\n").trim();
}

function buildEmailUrl(provider: string, to: string, subject: string, body: string): string {
  const s = encodeURIComponent(subject), b = encodeURIComponent(body), t = encodeURIComponent(to);
  switch (provider) {
    case "gmail":   return `https://mail.google.com/mail/?view=cm&to=${t}&su=${s}&body=${b}`;
    case "outlook": return `https://outlook.live.com/mail/0/deeplink/compose?to=${t}&subject=${s}&body=${b}`;
    case "zoho":    return `https://mail.zoho.in/zm/#compose?to=${t}&subject=${s}&body=${b}`;
    default:        return `mailto:${to}?subject=${s}&body=${b}`;
  }
}

async function generateChecklist(
  engagementId: string,
  clientId: string | null,
  type: string,
  conditions: EngagementConditions = {}
) {
  const userId = await getCurrentUserId();
  // Check custom templates first
  const { data: customTpls } = await supabase
    .from("checklist_templates")
    .select("doc_name, requirement, sort_order")
    .eq("user_id", userId ?? "")
    .eq("service_type", type)
    .order("sort_order", { ascending: true });

  const template = (customTpls && customTpls.length > 0)
    ? customTpls.map(t => ({ name: t.doc_name, requirement: t.requirement as "mandatory" | "optional" }))
    : getTemplate(type, conditions); // ✅ Pass conditions

  if (template.length === 0) return;

  const rows = template.map((t, i) => ({
    user_id: userId,
    engagement_id: engagementId,
    client_id: clientId || null,
    doc_name: t.name,
    requirement: t.requirement,
    status: "pending",
    sort_order: i,
  }));

  const { error } = await supabase
    .from("engagement_documents")
    .upsert(rows, { onConflict: "engagement_id,doc_name", ignoreDuplicates: true });
  if (error) throw error;
}

const isActive = (e: any) => e.status !== "completed" && e.status !== "billed";
const primaryIsChase = (e: any, s: ReturnType<typeof summarize>) =>
  isActive(e) && e.status !== "ready_for_review" && e.status !== "on_hold" && s.state === "pending_docs";

const btn = "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap";
type Tab = "all" | "review" | "docs" | "ready";
type MenuState = { id: string; right: number; top?: number; bottom?: number } | null;

function EngagementsPage() {
  const qc = useQueryClient();
  const { triggerEvent } = useTour();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; engagement?: any | null } | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [checklistFor, setChecklistFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [rejectModal, setRejectModal] = useState<{ engId: string; engTitle: string; checkerName: string } | null>(null);
  const [approveModal, setApproveModal] = useState<{ engId: string; engTitle: string; checkerName: string } | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [menu]);

  const { data: engagements, isLoading } = useQuery({
    queryKey: ["engagements"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.from("engagements")
        .select("*, clients!inner(name, firm_name, status)")
        .eq("user_id", userId ?? "")
        .neq("clients.status", "deleted").neq("clients.status", "archived")
        .order("deadline", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-for-select"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("clients").select("*").eq("user_id", userId ?? "").order("name");
      return (data ?? []) as any[];
    },
  });

  const { data: staffList } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("staff").select("id, name, role").eq("user_id", userId ?? "").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: docs } = useQuery({
    queryKey: ["engagement-docs"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.from("engagement_documents")
        .select("id, engagement_id, doc_name, requirement, status, sort_order, received_at")
        .eq("user_id", userId ?? "").order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocRow[];
    },
  });

  const { data: firmSettings } = useQuery({
    queryKey: ["firm-name"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("settings").select("firm_name, email_provider").eq("user_id", userId ?? "").limit(1).maybeSingle();
      return data as { firm_name: string; email_provider: string } | null;
    },
  });

  const firmName = firmSettings?.firm_name ?? "";
  const emailProvider = firmSettings?.email_provider ?? "default";
  const docsByEng: Record<string, DocRow[]> = {};
  (docs ?? []).forEach(d => { (docsByEng[d.engagement_id] ??= []).push(d); });
  const clientMap: Record<string, any> = {};
  (clients ?? []).forEach(c => { clientMap[c.id] = c; });

  const inTab = (e: any, tab: Tab) => {
    const s = summarize(docsByEng[e.id]);
    if (tab === "review") return e.status === "ready_for_review";
    if (tab === "docs") return isActive(e) && s.state === "pending_docs";
    if (tab === "ready") return (e.status === "pending" || e.status === "in_progress") && s.state === "ready";
    return hideCompleted ? isActive(e) : true;
  };

  const counts = {
    review: engagements?.filter(e => inTab(e, "review")).length ?? 0,
    docs:   engagements?.filter(e => inTab(e, "docs")).length ?? 0,
    ready:  engagements?.filter(e => inTab(e, "ready")).length ?? 0,
  };
  const filtered = engagements?.filter(e => inTab(e, activeTab));
  const invalidateEngagements = () => { qc.invalidateQueries({ queryKey: ["engagements"] }); qc.invalidateQueries({ queryKey: ["engagements-all"] }); };

  const quickUpdateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("engagements").update({ status }).eq("id", id);
    if (error) { alert("Could not update status: " + error.message); return; }
    invalidateEngagements();
  };

  const changeStatus = async (id: string, newStatus: string, opts: { actorName?: string; notes?: string; checkerNotes?: string; historyAction?: string } = {}) => {
    const userId = await getCurrentUserId();
    const updates: Record<string, any> = { status: newStatus, last_action_at: new Date().toISOString() };
    if (opts.checkerNotes !== undefined) updates.checker_notes = opts.checkerNotes;
    const { error } = await supabase.from("engagements").update(updates).eq("id", id);
    if (error) { alert("Could not update status: " + error.message); return; }
    const actionMap: Record<string, string> = { in_progress: "started", ready_for_review: "submitted", completed: "approved", on_hold: "on_hold" };
    const action = opts.historyAction ?? actionMap[newStatus];
    if (action) {
      await supabase.from("engagement_history").insert({ user_id: userId, engagement_id: id, action, actor_name: opts.actorName ?? null, notes: opts.notes ?? null });
      qc.invalidateQueries({ queryKey: ["engagement-history"] });
    }
    invalidateEngagements();
  };

  const archiveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => { const { error } = await supabase.from("engagements").update({ status: "completed" }).eq("id", id); if (error) throw error; },
    onSuccess: invalidateEngagements,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase.from("engagements").insert({ ...payload, user_id: userId }).select("id, client_id, type, has_capital_gains, has_house_property, has_foreign_income, has_exports, has_employees, is_listed_company").single();
      if (error) throw error;
      // Get client flags for conditions
      const client = clientMap[data.client_id];
      const conditions: EngagementConditions = {
        has_capital_gains:  data.has_capital_gains  ?? false,
        has_house_property: data.has_house_property ?? false,
        has_foreign_income: data.has_foreign_income ?? false,
        has_exports:        data.has_exports        ?? false,
        has_employees:      data.has_employees      ?? false,
        is_listed_company:  data.is_listed_company  ?? false,
        gst_registered:     client?.gst_registered  ?? false,
        tds_applicable:     client?.tds_applicable  ?? false,
        pf_applicable:      client?.pf_applicable   ?? false,
      };
      try { await generateChecklist(data.id, data.client_id, data.type, conditions); }
      catch (err: any) { console.error(err); alert("Engagement saved, but checklist could not be created. " + (err?.message ?? "")); }
    },
    onSuccess: () => { invalidateEngagements(); qc.invalidateQueries({ queryKey: ["engagement-docs"] }); triggerEvent("engagement_saved"); setModalState(null); },
    onError: (err: any) => alert("Could not save engagement: " + (err?.message ?? "")),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => { const { error } = await supabase.from("engagements").update(payload).eq("id", id); if (error) throw error; },
    onSuccess: () => { invalidateEngagements(); setModalState(null); },
    onError: (err: any) => alert("Could not update engagement: " + (err?.message ?? "")),
  });

  const generateMutation = useMutation({
    mutationFn: async (e: any) => {
      const client = clientMap[e.client_id];
      const conditions: EngagementConditions = {
        has_capital_gains:  e.has_capital_gains  ?? false,
        has_house_property: e.has_house_property ?? false,
        has_foreign_income: e.has_foreign_income ?? false,
        has_exports:        e.has_exports        ?? false,
        has_employees:      e.has_employees      ?? false,
        is_listed_company:  e.is_listed_company  ?? false,
        gst_registered:     client?.gst_registered ?? false,
        tds_applicable:     client?.tds_applicable ?? false,
        pf_applicable:      client?.pf_applicable  ?? false,
      };
      return generateChecklist(e.id, e.client_id, e.type, conditions);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engagement-docs"] }),
    onError: (err: any) => alert("Could not generate checklist: " + (err?.message ?? "")),
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DocStatus }) => {
      const { error } = await supabase.from("engagement_documents").update({ status, received_at: status === "received" ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engagement-docs"] }),
    onError: (err: any) => alert("Could not update document: " + (err?.message ?? "")),
  });

  const chase = async (e: any) => {
    const s = summarize(docsByEng[e.id]);
    if (s.pendingCount === 0) { alert("All documents received — no reminder needed."); return; }
    const client = clientMap[e.client_id];
    const clientName = e.clients?.name ?? client?.name ?? "Sir/Madam";
    const phone = cleanPhone(client?.phone ?? client?.mobile ?? client?.whatsapp);
    const msg = encodeURIComponent(buildChaseMessage(e, s.pendingDocs, clientName, firmName));
    window.open(phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank");
    await supabase.from("engagements").update({ reminder_count: (e.reminder_count ?? 0) + 1, last_reminder_date: new Date().toISOString() }).eq("id", e.id);
    invalidateEngagements();
  };

  const emailChase = async (e: any) => {
    const s = summarize(docsByEng[e.id]);
    if (s.pendingCount === 0) { alert("All documents received — no reminder needed."); return; }
    const client = clientMap[e.client_id];
    const clientEmail = client?.email ?? "";
    if (!clientEmail) { alert("Client ka email nahi mila."); return; }
    const clientName = e.clients?.name ?? client?.name ?? "Sir/Madam";
    window.open(buildEmailUrl(emailProvider, clientEmail, `Documents Required — ${e.title} (${e.type})`, buildChaseMessage(e, s.pendingDocs, clientName, firmName)), "_blank");
    await supabase.from("engagements").update({ reminder_count: (e.reminder_count ?? 0) + 1, last_reminder_date: new Date().toISOString() }).eq("id", e.id);
    invalidateEngagements();
  };

  const handleApprove = async (engId: string, checkerName: string, notes: string) => {
    setActionPending(true);
    await changeStatus(engId, "completed", { actorName: checkerName || undefined, notes: notes || undefined, checkerNotes: notes || undefined, historyAction: "approved" });
    setApproveModal(null);
    setActionPending(false);
  };

  const handleReject = async (engId: string, checkerName: string, reason: string) => {
    setActionPending(true);
    const userId = await getCurrentUserId();
    const { error } = await supabase.from("engagements").update({ status: "in_progress", last_action_at: new Date().toISOString(), checker_notes: reason }).eq("id", engId);
    if (error) { alert("Could not reject: " + error.message); setActionPending(false); return; }
    await supabase.from("engagement_history").insert({ user_id: userId, engagement_id: engId, action: "rejected", actor_name: checkerName || null, notes: reason });
    qc.invalidateQueries({ queryKey: ["engagement-history"] });
    invalidateEngagements();
    setRejectModal(null);
    setActionPending(false);
  };

  const renderPrimary = (e: any, s: ReturnType<typeof summarize>) => {
    if (e.status === "ready_for_review") {
      return (
        <>
          <button onClick={() => setApproveModal({ engId: e.id, engTitle: e.title, checkerName: e.reviewed_by ?? "" })} className={`${btn} bg-green-50 text-green-700 border-green-200 hover:bg-green-100`}><CheckCircle2 size={13} /> Approve</button>
          <button onClick={() => setRejectModal({ engId: e.id, engTitle: e.title, checkerName: e.reviewed_by ?? "" })} className={`${btn} bg-card text-red-600 border-red-200 hover:bg-red-50`}><X size={13} /> Reject</button>
        </>
      );
    }
    if (!isActive(e)) return <span className="text-xs text-muted-foreground">—</span>;
    if (e.status === "on_hold") return <button onClick={() => void changeStatus(e.id, "in_progress", { actorName: e.assigned_to || undefined, historyAction: "resumed" })} className={`${btn} bg-muted text-foreground border-input`}><Play size={13} /> Resume</button>;
    if (primaryIsChase(e, s)) return <button onClick={() => void chase(e)} className={`${btn} bg-green-50 text-green-700 border-green-200 hover:bg-green-100`}><MessageCircle size={13} /> Chase</button>;
    if (e.status === "pending") return <button onClick={() => void changeStatus(e.id, "in_progress", { actorName: e.assigned_to || undefined })} className={`${btn} bg-primary/5 text-primary border-primary/20 hover:bg-primary/10`}><Play size={13} /> Start</button>;
    if (e.status === "in_progress") return <button onClick={() => void changeStatus(e.id, "ready_for_review", { actorName: e.assigned_to || undefined })} className={`${btn} bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100`}><Clock size={13} /> Send for Review</button>;
    return null;
  };

  const openMenu = (ev: React.MouseEvent<HTMLButtonElement>, id: string) => {
    if (menu?.id === id) { setMenu(null); return; }
    const r = ev.currentTarget.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    const openUp = r.bottom + 220 > window.innerHeight;
    setMenu(openUp ? { id, right, bottom: window.innerHeight - r.top + 4 } : { id, right, top: r.bottom + 4 });
  };

  const menuEngagement = menu ? engagements?.find(e => e.id === menu.id) : null;
  const checklistEngagement = checklistFor ? engagements?.find(e => e.id === checklistFor) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Engagements</h1>
          <p className="text-muted-foreground text-sm">Track all client engagements</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setHideCompleted(v => !v)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border ${hideCompleted ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-muted"}`}>Hide Completed</button>
          <button onClick={() => setModalState({ mode: "create" })} className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"><Plus size={16} /> Add Engagement</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <TabButton active={activeTab === "all"} activeClass="bg-primary text-primary-foreground border-primary" onClick={() => setActiveTab("all")} label="All Engagements" />
        <TabButton active={activeTab === "docs"} activeClass="bg-amber-500 text-primary-foreground border-amber-500" badgeClass="bg-amber-500 text-primary-foreground" activeBadgeClass="bg-card text-amber-600" onClick={() => setActiveTab("docs")} icon={<AlertCircle size={14} />} label="Pending Client Docs" count={counts.docs} />
        <TabButton active={activeTab === "ready"} activeClass="bg-green-600 text-primary-foreground border-green-600" badgeClass="bg-green-600 text-primary-foreground" activeBadgeClass="bg-card text-green-700" onClick={() => setActiveTab("ready")} icon={<CheckCircle2 size={14} />} label="Ready to Process" count={counts.ready} />
        <TabButton active={activeTab === "review"} activeClass="bg-purple-500 text-primary-foreground border-purple-500" badgeClass="bg-purple-500 text-primary-foreground" activeBadgeClass="bg-card text-purple-600" onClick={() => setActiveTab("review")} icon={<Clock size={14} />} label="Pending Review" count={counts.review} />
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-left [&_th]:font-semibold [&_th]:uppercase [&_th]:text-xs [&_th]:tracking-wide">
            <tr>
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Deadline</th>
              <th className="px-5 py-3">Docs</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Maker</th>
              <th className="px-5 py-3">Checker</th>
              <th className="px-5 py-3">Next Step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && filtered?.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-muted-foreground">
                {activeTab === "review" && "🎉 No pending reviews!"}
                {activeTab === "docs" && "🎉 No engagements waiting for client documents!"}
                {activeTab === "ready" && "Nothing ready to process yet."}
                {activeTab === "all" && "No engagements found."}
              </td></tr>
            )}
            {filtered?.map((e: any) => {
              const s = summarize(docsByEng[e.id]);
              const hasTemplate = getTemplate(e.type).length > 0;
              return (
                <tr key={e.id} className={`hover:bg-muted ${e.status === "ready_for_review" ? "bg-purple-50/30" : ""}`}>
                  <td className="px-5 py-3 font-medium text-foreground">{e.clients?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-foreground">
                    <div>
                      {e.title}
                      {e.checker_notes && e.status === "in_progress" && <p className="text-[10px] text-red-600 mt-0.5 max-w-[180px] truncate" title={e.checker_notes}>⚠ {e.checker_notes}</p>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-foreground">{e.type}</td>
                  <td className="px-5 py-3 text-foreground whitespace-nowrap">{e.deadline ? format(new Date(e.deadline), "dd MMM yyyy") : "—"}</td>
                  <td className="px-5 py-3">
                    {s.total > 0 ? (
                      <button onClick={() => setChecklistFor(e.id)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border ${s.state === "ready" ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"}`}>
                        <ClipboardList size={13} />{s.state === "ready" ? "✓ " : ""}{s.done}/{s.total}
                      </button>
                    ) : hasTemplate ? (
                      <button onClick={() => generateMutation.mutate(e)} disabled={generateMutation.isPending} className="inline-flex items-center gap-1 text-xs text-primary font-medium disabled:opacity-50">
                        <ClipboardList size={13} /> Generate
                      </button>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <select value={e.status} onChange={ev => { void quickUpdateStatus(e.id, ev.target.value); }} className={`rounded-md border-0 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer ${statusColors[e.status] ?? "bg-muted text-foreground"}`}>
                      {STATUSES.map(status => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-foreground text-xs">{e.assigned_to || "—"}</td>
                  <td className="px-5 py-3 text-foreground text-xs">{e.reviewed_by || "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">{renderPrimary(e, s)}</div>
                      <button type="button" onClick={ev => openMenu(ev, e.id)} className={`p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${menu?.id === e.id ? "bg-muted text-foreground" : ""}`}><MoreHorizontal size={16} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {menu && menuEngagement && (() => {
        const e = menuEngagement;
        const s = summarize(docsByEng[e.id]);
        const hasTemplate = getTemplate(e.type).length > 0;
        const clientHasEmail = !!clientMap[e.client_id]?.email;
        const item = "w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2";
        const run = (fn: () => void) => () => { setMenu(null); fn(); };
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div className="fixed z-50 w-52 bg-card border border-border rounded-md shadow-lg py-1" style={{ right: menu.right, top: menu.top, bottom: menu.bottom }}>
              <button className={item} onClick={run(() => setModalState({ mode: "edit", engagement: e }))}><Pencil size={14} /> Edit</button>
              {s.total > 0 ? <button className={item} onClick={run(() => setChecklistFor(e.id))}><ClipboardList size={14} /> Open Checklist</button>
                : hasTemplate ? <button className={item} onClick={run(() => generateMutation.mutate(e))}><ClipboardList size={14} /> Generate Checklist</button> : null}
              {s.pendingCount > 0 && isActive(e) && !primaryIsChase(e, s) && <button className={item} onClick={run(() => void chase(e))}><MessageCircle size={14} /> WhatsApp Reminder</button>}
              {s.pendingCount > 0 && isActive(e) && clientHasEmail && <button className={item} onClick={run(() => void emailChase(e))}><Mail size={14} /> Email Reminder</button>}
              {e.status !== "completed" && e.status !== "ready_for_review" && (
                <><div className="my-1 border-t border-border" /><button className={`${item} text-muted-foreground`} onClick={run(() => archiveMutation.mutate({ id: e.id }))}><Archive size={14} /> Archive</button></>
              )}
            </div>
          </>
        );
      })()}

      {modalState && (
        <EngagementModal
          mode={modalState.mode}
          initialEngagement={modalState.engagement ?? undefined}
          clients={clients ?? []}
          staffList={staffList ?? []}
          onClose={() => setModalState(null)}
          onSubmit={payload => {
            if (modalState.mode === "edit" && modalState.engagement?.id) { updateMutation.mutate({ id: modalState.engagement.id, payload }); return; }
            addMutation.mutate(payload);
          }}
          pending={addMutation.isPending || updateMutation.isPending}
        />
      )}

      {checklistEngagement && (
        <ChecklistModal
          engagement={checklistEngagement}
          docs={docsByEng[checklistEngagement.id] ?? []}
          onClose={() => setChecklistFor(null)}
          onUpdate={(id, status) => updateDocMutation.mutate({ id, status })}
          updating={updateDocMutation.isPending}
          onChase={() => void chase(checklistEngagement)}
          onEmailChase={() => void emailChase(checklistEngagement)}
          clientEmail={clientMap[checklistEngagement.client_id]?.email ?? ""}
        />
      )}

      {rejectModal && <RejectModal engTitle={rejectModal.engTitle} onConfirm={reason => void handleReject(rejectModal.engId, rejectModal.checkerName, reason)} onCancel={() => setRejectModal(null)} pending={actionPending} />}
      {approveModal && <ApproveModal engTitle={approveModal.engTitle} onConfirm={notes => void handleApprove(approveModal.engId, approveModal.checkerName, notes)} onCancel={() => setApproveModal(null)} pending={actionPending} />}
    </div>
  );
}

function TabButton({ active, activeClass, badgeClass, activeBadgeClass, onClick, icon, label, count }: {
  active: boolean; activeClass: string; badgeClass?: string; activeBadgeClass?: string;
  onClick: () => void; icon?: React.ReactNode; label: string; count?: number;
}) {
  return (
    <button onClick={onClick} className={`px-4 py-2 rounded-md text-sm font-medium border transition-all flex items-center gap-2 ${active ? activeClass : "bg-card text-muted-foreground border-input hover:bg-muted"}`}>
      {icon}{label}
      {count !== undefined && count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${active ? activeBadgeClass : badgeClass}`}>{count}</span>}
    </button>
  );
}

const DOC_OPTIONS: { value: DocStatus; label: string; activeClass: string }[] = [
  { value: "pending",        label: "Pending",  activeClass: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "received",       label: "Received", activeClass: "bg-green-100 text-green-800 border-green-300" },
  { value: "not_applicable", label: "N/A",      activeClass: "bg-muted text-foreground border-input" },
];

function ChecklistModal({ engagement, docs, onClose, onUpdate, updating, onChase, onEmailChase, clientEmail }: {
  engagement: any; docs: DocRow[]; onClose: () => void;
  onUpdate: (id: string, status: DocStatus) => void; updating: boolean;
  onChase: () => void; onEmailChase: () => void; clientEmail: string;
}) {
  const s = summarize(docs);
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const [showHistory, setShowHistory] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["engagement-history", engagement.id],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("engagement_history").select("id, action, actor_name, notes, created_at").eq("engagement_id", engagement.id).eq("user_id", userId ?? "").order("created_at", { ascending: true });
      return (data ?? []) as HistoryRow[];
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">Document Checklist</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{engagement.clients?.name ?? "—"} · {engagement.title} ({engagement.type})</p>
            {engagement.checker_notes && <p className="text-xs text-red-600 mt-1.5 bg-red-50 border border-red-100 px-2 py-1 rounded">⚠ Last rejection note: {engagement.checker_notes}</p>}
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${s.state === "ready" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
              {s.state === "ready" ? "Ready to Process" : `Pending Client Docs — ${s.mandatoryPending} mandatory pending`}
            </span>
            <span className="text-muted-foreground text-xs font-medium">{s.done} / {s.total} done</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${s.state === "ready" ? "bg-green-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="overflow-y-auto divide-y divide-border flex-1">
          {docs.map(d => (
            <div key={d.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-sm ${d.status === "not_applicable" ? "text-muted-foreground line-through" : "text-foreground"}`}>{d.doc_name}</p>
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${d.requirement === "mandatory" ? "text-red-500" : "text-muted-foreground"}`}>{d.requirement}</span>
              </div>
              <div className="flex gap-1 shrink-0">
                {DOC_OPTIONS.map(opt => (
                  <button key={opt.value} disabled={updating} onClick={() => d.status !== opt.value && onUpdate(d.id, opt.value)}
                    className={`px-2 py-1 rounded-md text-xs font-medium border disabled:opacity-60 ${d.status === opt.value ? opt.activeClass : "bg-card text-muted-foreground border-border hover:bg-muted"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {history && history.length > 0 && (
            <div className="px-5 py-3">
              <button onClick={() => setShowHistory(v => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wide">
                {showHistory ? "▾" : "▸"} Activity History ({history.length})
              </button>
              {showHistory && (
                <div className="mt-3 space-y-3">
                  {history.map(h => {
                    const info = ACTION_LABELS[h.action] ?? { label: h.action, color: "text-muted-foreground" };
                    return (
                      <div key={h.id} className="flex items-start gap-3 text-xs">
                        <span className="text-muted-foreground whitespace-nowrap pt-0.5 min-w-[100px]">{format(new Date(h.created_at), "dd MMM, h:mm a")}</span>
                        <div className="min-w-0">
                          <span className={`font-semibold ${info.color}`}>{info.label}</span>
                          {h.actor_name && <span className="text-muted-foreground"> — {h.actor_name}</span>}
                          {h.notes && <p className="text-muted-foreground italic mt-0.5 bg-muted/50 px-2 py-1 rounded">"{h.notes}"</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {engagement.last_reminder_date ? `Last reminder: ${format(new Date(engagement.last_reminder_date), "dd MMM yyyy")} · ${engagement.reminder_count ?? 0} sent` : "No reminder sent yet"}
          </p>
          <div className="flex gap-2 flex-wrap">
            {clientEmail && s.pendingCount > 0 && <button onClick={onEmailChase} className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted"><Mail size={14} /> Email</button>}
            <button onClick={onChase} disabled={s.pendingCount === 0} className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-green-600 text-primary-foreground hover:bg-green-700 disabled:opacity-50"><MessageCircle size={14} /> Chase on WhatsApp</button>
            <button onClick={onClose} className="px-3 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EngagementModal({ mode, initialEngagement, clients, staffList, onClose, onSubmit, pending }: {
  mode: "create" | "edit"; initialEngagement?: any;
  clients: Pick<Client, "id" | "name">[]; staffList?: any[];
  onClose: () => void; onSubmit: (data: any) => void; pending: boolean;
}) {
  const [form, setForm] = useState({
    client_id:          initialEngagement?.client_id ?? "",
    title:              initialEngagement?.title ?? "",
    type:               initialEngagement?.type ?? "GST Return",
    custom_type:        "",
    deadline:           initialEngagement?.deadline ?? "",
    assigned_to:        initialEngagement?.assigned_to ?? "",
    reviewed_by:        initialEngagement?.reviewed_by ?? "",
    status:             initialEngagement?.status ?? "pending",
    // Condition flags
    has_capital_gains:  initialEngagement?.has_capital_gains  ?? false,
    has_house_property: initialEngagement?.has_house_property ?? false,
    has_foreign_income: initialEngagement?.has_foreign_income ?? false,
    has_exports:        initialEngagement?.has_exports        ?? false,
    has_employees:      initialEngagement?.has_employees      ?? false,
    is_listed_company:  initialEngagement?.is_listed_company  ?? false,
  });

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const effectiveType = form.type === "Other" && form.custom_type.trim() ? form.custom_type.trim() : form.type;
  const templateCount = getTemplate(effectiveType, {
    has_capital_gains:  form.has_capital_gains,
    has_house_property: form.has_house_property,
    has_foreign_income: form.has_foreign_income,
    has_exports:        form.has_exports,
    has_employees:      form.has_employees,
    is_listed_company:  form.is_listed_company,
  }).length;

  const makerStaff = staffList ?? [];
  const checkerStaff = (staffList ?? []).filter((s: any) => CHECKER_ROLES.includes(s.role));

  const CONDITION_FLAGS = [
    { key: "has_capital_gains",  label: "Has Capital Gains this year" },
    { key: "has_house_property", label: "Has House Property Income" },
    { key: "has_foreign_income", label: "Has Foreign Income / Assets" },
    { key: "has_exports",        label: "Exported Goods / Services" },
    { key: "has_employees",      label: "Has Employees (PF / ESI / Payroll)" },
    { key: "is_listed_company",  label: "Listed Company (SEBI compliance)" },
  ] as const;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{mode === "edit" ? "Edit Engagement" : "Add Engagement"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            onSubmit({
              ...form,
              type: effectiveType,
              deadline: form.deadline || null,
              reviewed_by: form.reviewed_by || null,
            });
          }}
          className="p-5 space-y-4"
        >
          {/* Client */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Client *</label>
            <select required value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className={inputClass}>
              <option value="">Select a client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputClass} />
          </div>

          {/* Type + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputClass}>
                {ENGAGEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {form.type === "Other" && (
                <input
                  value={form.custom_type}
                  onChange={e => setForm({ ...form, custom_type: e.target.value })}
                  placeholder="Specify service type..."
                  className={`${inputClass} mt-2`}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputClass}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>

          {/* Template count */}
          {mode === "create" && (
            <p className="text-xs text-muted-foreground -mt-2">
              {templateCount > 0 ? `📋 ${templateCount} documents in checklist (based on conditions below).` : "No document checklist for this type."}
            </p>
          )}

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Deadline</label>
            <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className={inputClass} />
          </div>

          {/* ✅ Conditional flags */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Client Situation — Affects Checklist</p>
            <p className="text-[11px] text-blue-600">Tick what applies — relevant documents will auto-include</p>
            <div className="space-y-2 mt-1">
              {CONDITION_FLAGS.map(flag => (
                <label key={flag.key} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[flag.key]}
                    onChange={e => setForm({ ...form, [flag.key]: e.target.checked })}
                    className="h-4 w-4 rounded border-input text-primary"
                  />
                  {flag.label}
                </label>
              ))}
            </div>
          </div>

          {/* Maker-Checker */}
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Maker — Checker</p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Assigned To (Maker)</label>
              {makerStaff.length > 0 ? (
                <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} className={inputClass}>
                  <option value="">Select staff member</option>
                  {makerStaff.map((s: any) => <option key={s.id} value={s.name}>{s.name}{s.role ? ` (${s.role})` : ""}</option>)}
                </select>
              ) : (
                <input value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} placeholder="Add staff from Staff page first" className={inputClass} />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Reviewed By (Checker)
                <span className="ml-1 text-purple-600 font-normal">— Qualified CA, Manager, Partner, Admin only</span>
              </label>
              {checkerStaff.length > 0 ? (
                <select value={form.reviewed_by} onChange={e => setForm({ ...form, reviewed_by: e.target.value })} className={inputClass}>
                  <option value="">Select reviewer</option>
                  {checkerStaff.map((s: any) => <option key={s.id} value={s.name}>{s.name} ({s.role})</option>)}
                </select>
              ) : (
                <div>
                  <input value={form.reviewed_by} onChange={e => setForm({ ...form, reviewed_by: e.target.value })} placeholder="No eligible checker found" className={inputClass} />
                  <p className="text-xs text-amber-600 mt-1">⚠ Add staff with role Qualified CA, Manager or Partner to use dropdown.</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update Engagement" : "Save Engagement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RejectModal({ engTitle, onConfirm, onCancel, pending }: { engTitle: string; onConfirm: (r: string) => void; onCancel: () => void; pending: boolean; }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border"><h2 className="font-semibold text-foreground">Reject Engagement</h2><button onClick={onCancel}><X size={18} /></button></div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Rejecting <strong className="text-foreground">{engTitle}</strong>. Maker ko wapas kaam karna padega.</p>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Reason <span className="text-red-500">*</span></label>
            <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Form 26AS mismatch with bank statement..." rows={3} className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
          <button disabled={!reason.trim() || pending} onClick={() => onConfirm(reason.trim())} className="px-4 py-2 text-sm rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-60">{pending ? "Rejecting..." : "Reject"}</button>
        </div>
      </div>
    </div>
  );
}

function ApproveModal({ engTitle, onConfirm, onCancel, pending }: { engTitle: string; onConfirm: (n: string) => void; onCancel: () => void; pending: boolean; }) {
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border"><h2 className="font-semibold text-foreground">Approve Engagement</h2><button onClick={onCancel}><X size={18} /></button></div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Approving <strong className="text-foreground">{engTitle}</strong>.</p>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Reviewer Note <span className="text-xs text-muted-foreground">(optional)</span></label>
            <textarea autoFocus value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Verified with client, all figures match..." rows={2} className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
          <button disabled={pending} onClick={() => onConfirm(notes.trim())} className="px-4 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">{pending ? "Approving..." : "Approve ✓"}</button>
        </div>
      </div>
    </div>
  );
}
