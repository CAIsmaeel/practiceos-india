import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Engagement, type Client, getCurrentUserId } from "@/lib/supabase";
import { ENGAGEMENT_TYPES, getTemplate } from "@/lib/checklistTemplates";
import { useState, useEffect } from "react";
import {
  Plus, X, Archive, Pencil, CheckCircle2, Clock,
  ClipboardList, MessageCircle, AlertCircle, MoreHorizontal, Play,
} from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/engagements")({
  head: () => ({ meta: [{ title: "Engagements — PracticeOS" }] }),
  component: EngagementsPage,
});

const STATUSES = ["pending", "in_progress", "ready_for_review", "completed", "billed", "on_hold"];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  ready_for_review: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  billed: "bg-teal-100 text-teal-800",
  on_hold: "bg-gray-200 text-gray-700",
};

// ---------- Document Chase helpers ----------

type DocStatus = "pending" | "received" | "not_applicable";

type DocRow = {
  id: string;
  engagement_id: string;
  doc_name: string;
  requirement: string;
  status: DocStatus;
  sort_order: number;
  received_at: string | null;
};

function summarize(docs: DocRow[] = []) {
  const total = docs.length;
  const done = docs.filter((d) => d.status !== "pending").length;
  const pendingDocs = docs.filter((d) => d.status === "pending");
  const mandatoryPending = pendingDocs.filter((d) => d.requirement === "mandatory").length;
  const state: "none" | "pending_docs" | "ready" =
    total === 0 ? "none" : mandatoryPending > 0 ? "pending_docs" : "ready";
  return { total, done, pendingDocs, pendingCount: pendingDocs.length, mandatoryPending, state };
}

function cleanPhone(raw?: string | null) {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d;
}

function buildChaseMessage(e: any, pendingDocs: DocRow[], clientName: string, firmName: string) {
  const lines = [
    `Dear ${clientName},`,
    "",
    `Hope you are doing well. To complete your ${e.title} (${e.type}), we still need the following:`,
    "",
    ...pendingDocs.map(
      (d, i) => `${i + 1}. ${d.doc_name}${d.requirement === "optional" ? " (if applicable)" : ""}`
    ),
    "",
    e.deadline
      ? `It would be great to receive these before ${format(new Date(e.deadline), "dd MMM yyyy")} so we can complete the work on time.`
      : "Please share these at your convenience so we can proceed.",
    "If any item does not apply to you, just let us know.",
    "",
    "Thank you!",
    firmName,
  ];
  return lines.join("\n").trim();
}

async function generateChecklist(engagementId: string, clientId: string | null, type: string) {
  const template = getTemplate(type);
  if (template.length === 0) return;
  const userId = await getCurrentUserId();
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

// Is the main button for this row "Chase"?
const primaryIsChase = (e: any, s: ReturnType<typeof summarize>) =>
  isActive(e) && e.status !== "ready_for_review" && e.status !== "on_hold" && s.state === "pending_docs";

const btn = "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border whitespace-nowrap";

// ---------- Page ----------

type Tab = "all" | "review" | "docs" | "ready";
type MenuState = { id: string; right: number; top?: number; bottom?: number } | null;

function EngagementsPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; engagement?: Engagement | null } | null>(null);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [checklistFor, setChecklistFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);

  // Close the ⋯ menu on scroll / resize
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const { data: engagements, isLoading } = useQuery({
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

  const { data: docs } = useQuery({
    queryKey: ["engagement-docs"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("engagement_documents")
        .select("id, engagement_id, doc_name, requirement, status, sort_order, received_at")
        .eq("user_id", userId ?? "")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocRow[];
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

  const docsByEng: Record<string, DocRow[]> = {};
  (docs ?? []).forEach((d) => {
    (docsByEng[d.engagement_id] ??= []).push(d);
  });

  const clientMap: Record<string, any> = {};
  (clients ?? []).forEach((c) => { clientMap[c.id] = c; });

  const inTab = (e: any, tab: Tab) => {
    const s = summarize(docsByEng[e.id]);
    if (tab === "review") return e.status === "ready_for_review";
    if (tab === "docs") return isActive(e) && s.state === "pending_docs";
    if (tab === "ready")
      return (e.status === "pending" || e.status === "in_progress") && s.state === "ready";
    return hideCompleted ? isActive(e) : true;
  };

  const counts = {
    review: engagements?.filter((e) => inTab(e, "review")).length ?? 0,
    docs: engagements?.filter((e) => inTab(e, "docs")).length ?? 0,
    ready: engagements?.filter((e) => inTab(e, "ready")).length ?? 0,
  };

  const filtered = engagements?.filter((e) => inTab(e, activeTab));

  const invalidateEngagements = () => {
    qc.invalidateQueries({ queryKey: ["engagements"] });
    qc.invalidateQueries({ queryKey: ["engagements-all"] });
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("engagements").update({ status }).eq("id", id);
    if (error) {
      alert("Could not update status: " + error.message);
      return;
    }
    invalidateEngagements();
  };

  const archiveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from("engagements").update({ status: "completed" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateEngagements,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("engagements")
        .insert({ ...payload, user_id: userId })
        .select("id, client_id, type")
        .single();
      if (error) throw error;
      try {
        await generateChecklist(data.id, data.client_id, data.type);
      } catch (err: any) {
        console.error(err);
        alert("Engagement saved, but checklist could not be created. Use Generate Checklist from the ⋯ menu. " + (err?.message ?? ""));
      }
    },
    onSuccess: () => {
      invalidateEngagements();
      qc.invalidateQueries({ queryKey: ["engagement-docs"] });
      setModalState(null);
    },
    onError: (err: any) => alert("Could not save engagement: " + (err?.message ?? "")),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const { error } = await supabase.from("engagements").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateEngagements();
      setModalState(null);
    },
    onError: (err: any) => alert("Could not update engagement: " + (err?.message ?? "")),
  });

  const generateMutation = useMutation({
    mutationFn: async (e: any) => generateChecklist(e.id, e.client_id, e.type),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["engagement-docs"] }),
    onError: (err: any) => alert("Could not generate checklist: " + (err?.message ?? "")),
  });

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

  const chase = async (e: any) => {
    const s = summarize(docsByEng[e.id]);
    if (s.pendingCount === 0) {
      alert("All documents received — no reminder needed.");
      return;
    }
    const client = clientMap[e.client_id];
    const clientName = e.clients?.name ?? client?.name ?? "Sir/Madam";
    const phone = cleanPhone(client?.phone ?? client?.mobile ?? client?.whatsapp);
    const msg = encodeURIComponent(buildChaseMessage(e, s.pendingDocs, clientName, firmName ?? ""));
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");

    const { error } = await supabase
      .from("engagements")
      .update({
        reminder_count: (e.reminder_count ?? 0) + 1,
        last_reminder_date: new Date().toISOString(),
      })
      .eq("id", e.id);
    if (error) console.error(error);
    invalidateEngagements();
  };

  // ----- Main (primary) action for each row -----
  const renderPrimary = (e: any, s: ReturnType<typeof summarize>) => {
    if (e.status === "ready_for_review") {
      return (
        <>
          <button
            onClick={() => void updateStatus(e.id, "completed")}
            className={`${btn} bg-green-50 text-green-700 border-green-200 hover:bg-green-100`}
          >
            <CheckCircle2 size={13} /> Approve
          </button>
          <button
            onClick={() => void updateStatus(e.id, "in_progress")}
            className={`${btn} bg-white text-red-600 border-red-200 hover:bg-red-50`}
          >
            <X size={13} /> Reject
          </button>
        </>
      );
    }
    if (!isActive(e)) return <span className="text-xs text-slate-400">—</span>;
    if (e.status === "on_hold") {
      return (
        <button
          onClick={() => void updateStatus(e.id, "in_progress")}
          className={`${btn} bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100`}
        >
          <Play size={13} /> Resume
        </button>
      );
    }
    if (primaryIsChase(e, s)) {
      return (
        <button
          onClick={() => void chase(e)}
          className={`${btn} bg-green-50 text-green-700 border-green-200 hover:bg-green-100`}
          title="Send WhatsApp reminder for pending documents"
        >
          <MessageCircle size={13} /> Chase
        </button>
      );
    }
    if (e.status === "pending") {
      return (
        <button
          onClick={() => void updateStatus(e.id, "in_progress")}
          className={`${btn} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100`}
        >
          <Play size={13} /> Start
        </button>
      );
    }
    if (e.status === "in_progress") {
      return (
        <button
          onClick={() => void updateStatus(e.id, "ready_for_review")}
          className={`${btn} bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100`}
        >
          <Clock size={13} /> Send for Review
        </button>
      );
    }
    return null;
  };

  const openMenu = (ev: React.MouseEvent<HTMLButtonElement>, id: string) => {
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const r = ev.currentTarget.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    const openUp = r.bottom + 190 > window.innerHeight;
    setMenu(
      openUp
        ? { id, right, bottom: window.innerHeight - r.top + 4 }
        : { id, right, top: r.bottom + 4 }
    );
  };

  const menuEngagement = menu ? engagements?.find((e) => e.id === menu.id) : null;
  const checklistEngagement = checklistFor ? engagements?.find((e) => e.id === checklistFor) : null;

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
            Hide Completed
          </button>
          <button
            onClick={() => setModalState({ mode: "create" })}
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            <Plus size={16} /> Add Engagement
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <TabButton active={activeTab === "all"} activeClass="bg-blue-500 text-white border-blue-500"
          onClick={() => setActiveTab("all")} label="All Engagements" />
        <TabButton active={activeTab === "docs"} activeClass="bg-amber-500 text-white border-amber-500"
          badgeClass="bg-amber-500 text-white" activeBadgeClass="bg-white text-amber-600"
          onClick={() => setActiveTab("docs")} icon={<AlertCircle size={14} />}
          label="Pending Client Docs" count={counts.docs} />
        <TabButton active={activeTab === "ready"} activeClass="bg-green-600 text-white border-green-600"
          badgeClass="bg-green-600 text-white" activeBadgeClass="bg-white text-green-700"
          onClick={() => setActiveTab("ready")} icon={<CheckCircle2 size={14} />}
          label="Ready to Process" count={counts.ready} />
        <TabButton active={activeTab === "review"} activeClass="bg-purple-500 text-white border-purple-500"
          badgeClass="bg-purple-500 text-white" activeBadgeClass="bg-white text-purple-600"
          onClick={() => setActiveTab("review")} icon={<Clock size={14} />}
          label="Pending Review" count={counts.review} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Deadline</th>
              <th className="px-5 py-3 font-medium">Docs</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Maker</th>
              <th className="px-5 py-3 font-medium">Checker</th>
              <th className="px-5 py-3 font-medium">Next Step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {!isLoading && filtered?.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-8 text-center text-slate-500">
                  {activeTab === "review" && "🎉 No pending reviews!"}
                  {activeTab === "docs" && "🎉 No engagements waiting for client documents!"}
                  {activeTab === "ready" && "Nothing ready to process yet."}
                  {activeTab === "all" && "No engagements found."}
                </td>
              </tr>
            )}
            {filtered?.map((e: any) => {
              const s = summarize(docsByEng[e.id]);
              const hasTemplate = getTemplate(e.type).length > 0;
              return (
                <tr key={e.id} className={`hover:bg-slate-50 ${e.status === "ready_for_review" ? "bg-purple-50/30" : ""}`}>
                  <td className="px-5 py-3 font-medium text-slate-900">{e.clients?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-700">{e.title}</td>
                  <td className="px-5 py-3 text-slate-700">{e.type}</td>
                  <td className="px-5 py-3 text-slate-700 whitespace-nowrap">
                    {e.deadline ? format(new Date(e.deadline), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {s.total > 0 ? (
                      <button
                        onClick={() => setChecklistFor(e.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border ${
                          s.state === "ready"
                            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                        }`}
                        title="Open checklist"
                      >
                        <ClipboardList size={13} />
                        {s.state === "ready" ? "✓ " : ""}{s.done}/{s.total}
                      </button>
                    ) : hasTemplate ? (
                      <button
                        onClick={() => generateMutation.mutate(e)}
                        disabled={generateMutation.isPending}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
                      >
                        <ClipboardList size={13} /> Generate
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <select
                      value={e.status}
                      onChange={(event) => { void updateStatus(e.id, event.target.value); }}
                      className={`rounded-md border-0 px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${statusColors[e.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3 text-slate-700 text-xs">{e.assigned_to || "—"}</td>
                  <td className="px-5 py-3 text-slate-700 text-xs">{e.reviewed_by || "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">{renderPrimary(e, s)}</div>
                      <button
                        type="button"
                        aria-label="More actions"
                        onClick={(ev) => openMenu(ev, e.id)}
                        className={`p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${
                          menu?.id === e.id ? "bg-slate-100 text-slate-800" : ""
                        }`}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ⋯ menu (rendered outside the table so it never gets cut off) */}
      {menu && menuEngagement && (() => {
        const e = menuEngagement;
        const s = summarize(docsByEng[e.id]);
        const hasTemplate = getTemplate(e.type).length > 0;
        const item = "w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2";
        const run = (fn: () => void) => () => { setMenu(null); fn(); };
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
            <div
              className="fixed z-50 w-48 bg-white border border-slate-200 rounded-md shadow-lg py-1"
              style={{ right: menu.right, top: menu.top, bottom: menu.bottom }}
            >
              <button className={item} onClick={run(() => setModalState({ mode: "edit", engagement: e }))}>
                <Pencil size={14} /> Edit
              </button>

              {s.total > 0 ? (
                <button className={item} onClick={run(() => setChecklistFor(e.id))}>
                  <ClipboardList size={14} /> Open Checklist
                </button>
              ) : hasTemplate ? (
                <button className={item} onClick={run(() => generateMutation.mutate(e))}>
                  <ClipboardList size={14} /> Generate Checklist
                </button>
              ) : null}

              {s.pendingCount > 0 && isActive(e) && !primaryIsChase(e, s) && (
                <button className={item} onClick={run(() => void chase(e))}>
                  <MessageCircle size={14} /> Send Reminder
                </button>
              )}

              {e.status !== "completed" && e.status !== "ready_for_review" && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    className={`${item} text-slate-500`}
                    onClick={run(() => archiveMutation.mutate({ id: e.id }))}
                  >
                    <Archive size={14} /> Archive
                  </button>
                </>
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

      {checklistEngagement && (
        <ChecklistModal
          engagement={checklistEngagement}
          docs={docsByEng[checklistEngagement.id] ?? []}
          onClose={() => setChecklistFor(null)}
          onUpdate={(id, status) => updateDocMutation.mutate({ id, status })}
          updating={updateDocMutation.isPending}
          onChase={() => void chase(checklistEngagement)}
        />
      )}
    </div>
  );
}

// ---------- Tab button ----------

function TabButton({
  active, activeClass, badgeClass, activeBadgeClass, onClick, icon, label, count,
}: {
  active: boolean;
  activeClass: string;
  badgeClass?: string;
  activeBadgeClass?: string;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-md text-sm font-medium border transition-all flex items-center gap-2 ${
        active ? activeClass : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${active ? activeBadgeClass : badgeClass}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ---------- Checklist modal ----------

const DOC_OPTIONS: { value: DocStatus; label: string; activeClass: string }[] = [
  { value: "pending", label: "Pending", activeClass: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "received", label: "Received", activeClass: "bg-green-100 text-green-800 border-green-300" },
  { value: "not_applicable", label: "N/A", activeClass: "bg-slate-200 text-slate-700 border-slate-300" },
];

function ChecklistModal({
  engagement, docs, onClose, onUpdate, updating, onChase,
}: {
  engagement: any;
  docs: DocRow[];
  onClose: () => void;
  onUpdate: (id: string, status: DocStatus) => void;
  updating: boolean;
  onChase: () => void;
}) {
  const s = summarize(docs);
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-900">Document Checklist</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {engagement.clients?.name ?? "—"} · {engagement.title} ({engagement.type})
            </p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {/* Progress */}
        <div className="px-5 py-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                s.state === "ready" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {s.state === "ready"
                ? "Ready to Process"
                : `Pending Client Docs — ${s.mandatoryPending} mandatory pending`}
            </span>
            <span className="text-slate-600 text-xs font-medium">{s.done} / {s.total} done</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${s.state === "ready" ? "bg-green-500" : "bg-amber-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto divide-y divide-slate-100">
          {docs.map((d) => (
            <div key={d.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`text-sm ${
                    d.status === "not_applicable" ? "text-slate-400 line-through" : "text-slate-800"
                  }`}
                >
                  {d.doc_name}
                </p>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wide ${
                    d.requirement === "mandatory" ? "text-red-500" : "text-slate-400"
                  }`}
                >
                  {d.requirement}
                </span>
              </div>
              <div className="flex gap-1 shrink-0">
                {DOC_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={updating}
                    onClick={() => d.status !== opt.value && onUpdate(d.id, opt.value)}
                    className={`px-2 py-1 rounded-md text-xs font-medium border disabled:opacity-60 ${
                      d.status === opt.value
                        ? opt.activeClass
                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500">
            {engagement.last_reminder_date
              ? `Last reminder: ${format(new Date(engagement.last_reminder_date), "dd MMM yyyy")} · ${engagement.reminder_count ?? 0} sent`
              : "No reminder sent yet"}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onChase}
              disabled={s.pendingCount === 0}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              <MessageCircle size={14} /> Chase on WhatsApp
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Add / Edit engagement modal ----------

function EngagementModal({
  mode, initialEngagement, clients, onClose, onSubmit, pending,
}: {
  mode: "create" | "edit";
  initialEngagement?: any;
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
    reviewed_by: initialEngagement?.reviewed_by ?? "",
    status: initialEngagement?.status ?? "pending",
  });

  const inputClass = "w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const templateCount = getTemplate(form.type).length;

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
            onSubmit({ ...form, deadline: form.deadline || null, reviewed_by: form.reviewed_by || null });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
            <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className={inputClass}>
              <option value="">Select a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={inputClass}>
                {ENGAGEMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>

          {mode === "create" && (
            <p className="text-xs text-slate-500 -mt-2">
              {templateCount > 0
                ? `📋 A ${templateCount}-item document checklist will be created automatically.`
                : "No document checklist for this type."}
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={inputClass} />
          </div>

          {/* Maker-Checker Fields */}
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Maker — Checker</p>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Assigned To (Maker)</label>
              <input
                value={form.assigned_to}
                onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                placeholder="e.g. Rahul (Article)"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Reviewed By (Checker)</label>
              <input
                value={form.reviewed_by}
                onChange={(e) => setForm({ ...form, reviewed_by: e.target.value })}
                placeholder="e.g. CA Ismaeel"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update Engagement" : "Save Engagement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}