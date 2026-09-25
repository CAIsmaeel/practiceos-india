import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, type QueryLog, type ErrorLog } from "@/lib/supabase";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Search } from "lucide-react";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity — Firmora" }] }),
  component: ActivityPage,
});

const channelColors: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-800",
  email: "bg-primary/10 text-primary",
};

const TRUNCATE_LEN = 80;

function TruncatedText({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span className="text-muted-foreground">—</span>;
  if (text.length <= TRUNCATE_LEN || expanded) {
    return (
      <span>
        {text}
        {text.length > TRUNCATE_LEN && expanded && (
          <button onClick={() => setExpanded(false)} className="ml-1 text-primary hover:underline text-xs">
            show less
          </button>
        )}
      </span>
    );
  }
  return (
    <span>
      {text.slice(0, TRUNCATE_LEN)}...
      <button onClick={() => setExpanded(true)} className="ml-1 text-primary hover:underline text-xs">
        show more
      </button>
    </span>
  );
}

function ActivityPage() {
  const [tab, setTab] = useState<"conversations" | "errors">("conversations");
  const [search, setSearch] = useState("");

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["query_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("query_log")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QueryLog[];
    },
  });

  const { data: errors, isLoading: errorsLoading } = useQuery({
    queryKey: ["error_log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("error_log")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ErrorLog[];
    },
  });

  const filteredLogs = search
    ? logs?.filter((l) => l.contact?.toLowerCase().includes(search.toLowerCase()))
    : logs;

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
        <p className="text-muted-foreground text-sm">System monitoring — AI conversations and errors</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab("conversations")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "conversations"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          AI Conversations
        </button>
        <button
          onClick={() => setTab("errors")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "errors"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          System Errors
        </button>
      </div>

      {tab === "conversations" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by contact..."
              className="w-full pl-9 pr-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="bg-card border border-border rounded-lg shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/60 text-muted-foreground text-left [&_th]:font-semibold [&_th]:uppercase [&_th]:text-xs [&_th]:tracking-wide">
                <tr>
                  <th className="px-5 py-3 font-medium">Channel</th>
                  <th className="px-5 py-3 font-medium">Contact</th>
                  <th className="px-5 py-3 font-medium">Query</th>
                  <th className="px-5 py-3 font-medium">AI Response</th>
                  <th className="px-5 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logsLoading && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
                )}
                {!logsLoading && filteredLogs?.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No conversations logged.</td></tr>
                )}
                {filteredLogs?.map((l) => (
                  <tr key={l.id} className="hover:bg-muted">
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${channelColors[l.channel ?? ""] ?? "bg-muted text-foreground"}`}>
                        {l.channel ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-foreground">{l.contact ?? "—"}</td>
                    <td className="px-5 py-3 text-foreground max-w-xs"><TruncatedText text={l.query_text} /></td>
                    <td className="px-5 py-3 text-foreground max-w-xs"><TruncatedText text={l.ai_response} /></td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {l.created_at ? formatDistanceToNow(new Date(l.created_at), { addSuffix: true }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "errors" && (
        <div className="bg-card border border-border rounded-lg shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-left [&_th]:font-semibold [&_th]:uppercase [&_th]:text-xs [&_th]:tracking-wide">
              <tr>
                <th className="px-5 py-3 font-medium">Workflow</th>
                <th className="px-5 py-3 font-medium">Node</th>
                <th className="px-5 py-3 font-medium">Error Message</th>
                <th className="px-5 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {errorsLoading && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
              )}
              {!errorsLoading && errors?.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">No errors logged.</td></tr>
              )}
              {errors?.map((e) => {
                const isRecent = e.created_at && new Date(e.created_at) > twentyFourHoursAgo;
                return (
                  <tr key={e.id} className={`hover:bg-muted ${isRecent ? "bg-red-50" : ""}`}>
                    <td className="px-5 py-3 text-foreground">{e.workflow_name ?? "—"}</td>
                    <td className="px-5 py-3 text-foreground">{e.node_name ?? "—"}</td>
                    <td className="px-5 py-3 text-foreground max-w-md">{e.error_message ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {e.created_at ? formatDistanceToNow(new Date(e.created_at), { addSuffix: true }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
