import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase, type Client, type FirmSettings } from "@/lib/supabase";
import { getGroqCompletion } from "@/lib/groq.server";
import { useState } from "react";
// @ts-ignore - lucide-react does not currently ship TypeScript declarations in this setup
import { Bot, Send } from "lucide-react";

export const Route = createFileRoute("/support-agent")({
  head: () => ({ meta: [{ title: "AI Client Support Agent — Firmora" }] }),
  component: SupportAgentPage,
});

type ChatMessage = {
  role: "client" | "ai";
  text: string;
  error?: boolean;
};

const STATS = [
  { label: "Auto-resolve rate", value: "94%" },
  { label: "Avg response time", value: "18s" },
  { label: "Queries this month", value: "0" },
  { label: "Escalated to CA", value: "0" },
];

const TOP_FAQS = [
  "When is GSTR-3B deadline?",
  "What documents are needed for ITR filing?",
  "What are fees for GST registration?",
  "What is the penalty for late filing?",
];

async function getGroqReply(firmName: string, history: ChatMessage[]): Promise<string> {
  const systemPrompt = `You are a CA firm assistant for ${firmName}. Answer client queries about GST, ITR, compliance deadlines. Be helpful and professional. Reply in the same language as the client.`;

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
  const [clientId, setClientId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

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
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("settings")
        .select("firm_name")
        .eq("user_id", user?.id ?? "")
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as Pick<FirmSettings, "firm_name"> | null;
    },
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
      console.error("Support agent reply error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Couldn't reach the AI assistant right now. Please try again.", error: true },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">AI Client Support Agent</h1>
        <p className="text-muted-foreground text-sm">
          AI automatically replies to client queries coming in via WhatsApp & Email
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* LEFT — Live Chat Preview */}
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="border border-input rounded-md px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select a client...</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-800 px-2.5 py-1 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
              AI Active
            </span>
          </div>

          <div className="flex-1 min-h-[360px] max-h-[480px] overflow-y-auto px-5 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground text-sm py-16">
                <Bot size={28} className="mb-2 text-muted-foreground" />
                Send a test query below, or pick one from the FAQs to see how the AI replies.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "client" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${
                    m.role === "client"
                      ? "bg-teal-500 text-white rounded-br-sm"
                      : m.error
                        ? "bg-card border border-destructive/30 text-destructive rounded-bl-sm"
                        : "bg-card border border-border text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm bg-card border border-border text-muted-foreground">
                  Typing...
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 px-5 py-4 border-t border-border"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a client query to test..."
              className="flex-1 border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              <Send size={15} /> Send
            </button>
          </form>
        </div>

        {/* RIGHT — Stats + FAQs */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {STATS.map((s) => (
              <div key={s.label} className="bg-card border border-border rounded-lg shadow-sm p-4">
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-lg shadow-sm">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Top FAQs</h2>
            </div>
            <ul className="divide-y divide-border">
              {TOP_FAQS.map((faq) => (
                <li key={faq}>
                  <button
                    type="button"
                    onClick={() => setInput(faq)}
                    className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-muted"
                  >
                    {faq}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
