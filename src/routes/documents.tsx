import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Client, getCurrentUserId } from "@/lib/supabase";
import { useState } from "react";
import { Plus, X, CheckCircle2, Trash2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/documents")({
  head: () => ({ meta: [{ title: "Documents — PracticeOS" }] }),
  component: DocumentsPage,
});

type DocRequest = {
  id: string;
  client_id: string;
  engagement_id: string | null;
  document_name: string;
  status: string;
  requested_date: string;
  received_date: string | null;
  followup_count: number;
  created_at: string;
  clients?: { name: string; firm_name: string | null } | null;
  engagements?: { title: string } | null;
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  received: "bg-green-100 text-green-800",
};

function DocumentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showReceived, setShowReceived] = useState(false);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("documents")
        .select("*, clients(name, firm_name), engagements(title)")
        .eq("user_id", userId ?? "")
        .order("requested_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocRequest[];
    },
  });

  const filtered = showReceived
    ? documents
    : documents?.filter((d) => d.status !== "received");

  const { data: clients } = useQuery({
    queryKey: ["clients-for-select"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", userId ?? "")
        .order("name");
      return (data ?? []) as Pick<Client, "id" | "name">[];
    },
  });

  const { data: engagements } = useQuery({
    queryKey: ["engagements-for-select"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase
        .from("engagements")
        .select("id, title, client_id")
        .eq("user_id", userId ?? "")
        .order("title");
      return (data ?? []) as { id: string; title: string; client_id: string }[];
    },
  });

  const requestMutation = useMutation({
    mutationFn: async (rows: Record<string, unknown>[]) => {
      const userId = await getCurrentUserId();
      const rowsWithUser = rows.map(r => ({ ...r, user_id: userId }));
      const { error } = await supabase.from("documents").insert(rowsWithUser);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      setOpen(false);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from("documents")
        .update({ status: "received", received_date: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
          <p className="text-slate-500 text-sm">Track document requests from clients</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowReceived((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border ${
              showReceived
                ? "bg-blue-500 text-white border-blue-500 hover:bg-blue-600"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {showReceived ? "Hide Received" : "Show Received"}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            <Plus size={16} /> Request Documents
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Document</th>
              <th className="px-5 py-3 font-medium">Engagement</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Requested</th>
              <th className="px-5 py-3 font-medium">Follow-ups</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {!isLoading && filtered?.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-500">No document requests found.</td></tr>
            )}
            {filtered?.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{d.clients?.name ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{d.document_name}</td>
                <td className="px-5 py-3 text-slate-700">{d.engagements?.title ?? "—"}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusColors[d.status] ?? "bg-gray-100 text-gray-700"}`}>
                    {d.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-slate-700">
                  {d.requested_date ? format(new Date(d.requested_date), "dd MMM yyyy") : "—"}
                </td>
                <td className="px-5 py-3 text-slate-700">{d.followup_count ?? 0}</td>
                <td className="px-5 py-3">
                  {d.status === "pending" && (
                    <button
                      onClick={() => receiveMutation.mutate({ id: d.id })}
                      disabled={receiveMutation.isPending}
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

      {open && (
        <RequestModal
          clients={clients ?? []}
          engagements={engagements ?? []}
          onClose={() => setOpen(false)}
          onSubmit={requestMutation.mutate}
          pending={requestMutation.isPending}
        />
      )}
    </div>
  );
}

function RequestModal({
  clients, engagements, onClose, onSubmit, pending,
}: {
  clients: Pick<Client, "id" | "name">[];
  engagements: { id: string; title: string; client_id: string }[];
  onClose: () => void;
  onSubmit: (rows: Record<string, unknown>[]) => void;
  pending: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [engagementId, setEngagementId] = useState("");
  const [docNames, setDocNames] = useState<string[]>([""]);

  const clientEngagements = engagements.filter((e) => e.client_id === clientId);

  const setDocName = (i: number, value: string) => {
    const next = [...docNames];
    next[i] = value;
    setDocNames(next);
  };

  const removeDocName = (i: number) => setDocNames(docNames.filter((_, idx) => idx !== i));

  const inputClass = "w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Request Documents</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const names = docNames.map((n) => n.trim()).filter(Boolean);
            if (names.length === 0) return;
            onSubmit(
              names.map((document_name) => ({
                client_id: clientId,
                engagement_id: engagementId || null,
                document_name,
                status: "pending",
              }))
            );
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Client <span className="text-red-500">*</span></label>
            <select
              required
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setEngagementId(""); }}
              className={inputClass}
            >
              <option value="">Select a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Engagement (optional)</label>
            <select
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              disabled={!clientId}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
            >
              <option value="">{clientId ? "None" : "Select a client first"}</option>
              {clientEngagements.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Document Names <span className="text-red-500">*</span></label>
            <div className="space-y-2">
              {docNames.map((name, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    required={i === 0}
                    value={name}
                    onChange={(e) => setDocName(i, e.target.value)}
                    placeholder={`Document ${i + 1}`}
                    className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {docNames.length > 1 && (
                    <button type="button" onClick={() => removeDocName(i)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDocNames([...docNames, ""])}
              className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <Plus size={14} /> Add another document
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60">
              {pending ? "Saving..." : "Request Documents"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
