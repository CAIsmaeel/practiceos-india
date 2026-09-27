import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type Client, type FirmSettings, getCurrentUserId } from "@/lib/supabase";
import { getGroqCompletion } from "@/lib/groq.server";
import { useState } from "react";
import { Bot, Send, MessageCircle, Globe, RefreshCw } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/support-agent")({
  head: () => ({ meta: [{ title: "AI Client Support Agent — Firmora" }] }),
  component: SupportAgentPage,
});

type ChatMessage = { role: "client" | "ai"; text: string; error?: boolean; };
type Tab = "live" | "website";

const TOP_FAQS = [
  "When is GSTR-3B deadline?",
  "What documents are needed for ITR filing?",
  "What are fees for GST registration?",
  "What is the penalty for late filing?",
];

async function getGroqReply(firmName: string, history: ChatMessage[]): Promise<string> {
  const systemPrompt = `You are a CA firm assistant for ${firmName}. Answer client queries about GST, ITR, compliance deadlines. Be helpful and professional. Reply in plain simple text only - no asterisks, no bold, no markdown. Keep answers short and clear. Reply in the same language as the client.`;
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.map((m) => ({
      role: (m.role === "client" ? "user" : "assistant") as "user" | "assistant",
      content: m.text,
    })),
  ];
  return getGroqCompletion({ data: { messages } });
}

function SupportAgentPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("website");
  const [clientId, setClientId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<any>(null);

  const { data: clients } = useQuery({
    queryKey: ["clients-for-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as Pick<Client, "id" | "name">[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("settings").select("firm_name").eq("user_id", user?.id ?? "").limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as Pick<FirmSettings, "firm_name"> | null;
    },
  });

  // ✅ Website queries from query_log
  const { data: websiteQueries, isLoading: queriesLoading } = useQuery({
    queryKey: ["query-log"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("query_log")
        .select("*")
        .eq("user_id", userId ?? "")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const firmName = settings?.firm_name?.trim() || "the firm";

  const send = async (text: string) => {
    const query = text.trim();
    if (!query || sending) return;
    const nextHistory: ChatMessage[] = [...messages, { role: "client", text: query }];
    setMessages(nextHistory);
    setInput("");
    setSending(true);
    try {
      const reply = await getGroqReply(firmName, nextHistory);
      setMessages((prev) => [...prev, { role: "ai", text: reply }]);
    } catch (err) {
      try {
        await new Promise(r => setTimeout(r, 1500));
        const retry = await getGroqReply(firmName, nextHistory);
        setMessages((prev) => [...prev, { role: "ai", text: retry }]);
      } catch {
        setMessages((prev) => [...prev, { role: "ai", text: "Couldn't reach AI right now. Please try again.", error: true }]);
      }
    } finally {
      setSending(false);
    }
  };

  const openWhatsApp = (query: any) => {
    const phone = query.client_phone?.replace(/\D/g, "") ?? "";
    const name = query.client_name ?? "client";
    const msg = encodeURIComponent(`Hi ${name}, thanks for reaching out. We've reviewed your query and would like to help you further.`);
    const url = phone ? `https://wa.me/91${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, "_blank");
  };

  const markResolved = async (id: string) => {
    await supabase.from("query_log").update({ status: "resolved" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["query-log"] });
    if (selectedQuery?.id === id) setSelectedQuery({ ...selectedQuery, status: "resolved" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Client Support Agent</h1>
        <p className="text-muted-foreground text-sm">
          Test the AI agent or view queries from your website chatbot
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab("website")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "website" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Globe size={14} />
          Website Queries
          {(websiteQueries ?? []).filter((q: any) => q.status === "open").length > 0 && (
            <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
              {(websiteQueries ?? []).filter((q: any) => q.status === "open").length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("live")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === "live" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Bot size={14} />
          Test AI Agent
        </button>
      </div>

      {/* ===== WEBSITE QUERIES TAB ===== */}
      {activeTab === "website" && (
        <div className="grid lg:grid-cols-[1fr_1.4fr] gap-6">
          {/* Query List */}
          <div className="bg-card border border-border rounded-xl shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Incoming Queries</h2>
              <button onClick={() => qc.invalidateQueries({ queryKey: ["query-log"] })} className="text-muted-foreground hover:text-foreground">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
              {queriesLoading && <p className="px-4 py-6 text-sm text-muted-foreground text-center">Loading...</p>}
              {!queriesLoading && (websiteQueries ?? []).length === 0 && (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  <Globe size={24} className="mx-auto mb-2 opacity-40" />
                  No website queries yet.
                  <br/>Share your landing page link to get started.
                </div>
              )}
              {(websiteQueries ?? []).map((q: any) => {
                const msgs: any[] = q.messages ?? [];
                const lastMsg = msgs[msgs.length - 1]?.text ?? "No messages";
                const isSelected = selectedQuery?.id === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuery(q)}
                    className={`px-4 py-3 cursor-pointer hover:bg-muted ${isSelected ? "bg-muted" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-foreground">{q.client_name ?? "Unknown"}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${q.status === "resolved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {q.status === "resolved" ? "✓ Resolved" : "Open"}
                      </span>
                    </div>
                    {q.client_phone && <p className="text-xs text-muted-foreground mb-1">📱 {q.client_phone}</p>}
                    <p className="text-xs text-muted-foreground truncate">{lastMsg}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(q.created_at), "dd MMM yyyy, hh:mm a")}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Query Detail */}
          <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col">
            {!selectedQuery ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                <div className="text-center">
                  <MessageCircle size={28} className="mx-auto mb-2 opacity-40" />
                  Select a query to view conversation
                </div>
              </div>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{selectedQuery.client_name ?? "Unknown"}</p>
                      {selectedQuery.client_phone && <p className="text-xs text-muted-foreground">📱 {selectedQuery.client_phone}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${selectedQuery.status === "resolved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {selectedQuery.status === "resolved" ? "✓ Resolved" : "Open"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Source: {selectedQuery.source ?? "Website"} • {format(new Date(selectedQuery.created_at), "dd MMM yyyy, hh:mm a")}
                  </p>
                </div>

                {/* Conversation */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 max-h-[320px] bg-muted/20">
                  {(selectedQuery.messages ?? []).map((m: any, i: number) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border text-foreground rounded-bl-sm"}`}>
                        <p className="text-[10px] opacity-60 mb-1">{m.role === "user" ? "Client" : "AI Bot"}</p>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t border-border flex gap-2 flex-wrap">
                  <button
                    onClick={() => openWhatsApp(selectedQuery)}
                    className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-green-700"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.115 1.528 5.845L0 24l6.335-1.508A11.96 11.96 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.007-1.37l-.36-.214-3.76.895.953-3.667-.234-.376A9.818 9.818 0 1112 21.818z"/></svg>
                    Reply on WhatsApp
                  </button>
                  {selectedQuery.status !== "resolved" && (
                    <button
                      onClick={() => markResolved(selectedQuery.id)}
                      className="inline-flex items-center gap-2 bg-card border border-border text-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-muted"
                    >
                      ✓ Mark Resolved
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== TEST AI TAB ===== */}
      {activeTab === "live" && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select a client...</option>
                {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-800 px-2.5 py-1 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
                AI Active
              </span>
            </div>

            <div className="flex-1 min-h-[360px] max-h-[480px] overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground text-sm py-16">
                  <Bot size={28} className="mb-2 opacity-40" />
                  Send a test query below or pick one from FAQs.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "client" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${m.role === "client" ? "bg-teal-500 text-white rounded-br-sm" : m.error ? "bg-card border border-destructive/30 text-destructive rounded-bl-sm" : "bg-card border border-border text-foreground rounded-bl-sm"}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm bg-card border border-border text-muted-foreground">Typing...</div>
                </div>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex items-center gap-2 px-5 py-4 border-t border-border">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a client query to test..." className="flex-1 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              <button type="submit" disabled={sending || !input.trim()} className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50">
                <Send size={15} /> Send
              </button>
            </form>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-lg shadow-sm p-4">
                <p className="text-2xl font-bold text-foreground">{(websiteQueries ?? []).length}</p>
                <p className="text-xs text-muted-foreground mt-1">Total website queries</p>
              </div>
              <div className="bg-card border border-border rounded-lg shadow-sm p-4">
                <p className="text-2xl font-bold text-foreground">{(websiteQueries ?? []).filter((q: any) => q.status === "open").length}</p>
                <p className="text-xs text-muted-foreground mt-1">Open queries</p>
              </div>
              <div className="bg-card border border-border rounded-lg shadow-sm p-4">
                <p className="text-2xl font-bold text-foreground">{(websiteQueries ?? []).filter((q: any) => q.status === "resolved").length}</p>
                <p className="text-xs text-muted-foreground mt-1">Resolved</p>
              </div>
              <div className="bg-card border border-border rounded-lg shadow-sm p-4">
                <p className="text-2xl font-bold text-green-600">AI</p>
                <p className="text-xs text-muted-foreground mt-1">Auto-handled</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg shadow-sm">
              <div className="px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">Top FAQs</h2>
              </div>
              <ul className="divide-y divide-border">
                {TOP_FAQS.map((faq) => (
                  <li key={faq}>
                    <button type="button" onClick={() => setInput(faq)} className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-muted">{faq}</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
