import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format, differenceInCalendarDays, isBefore, startOfDay, parseISO } from "date-fns";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/public/compliance")({
  head: () => ({ meta: [{ title: "Compliance Calendar" }] }),
  component: PublicCompliancePage,
});

function PublicCompliancePage() {
  // client_id from URL query param
  const search = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const clientId = search?.get("id") ?? "";
  const caId = search?.get("ca") ?? "";

  const { data: client } = useQuery({
    queryKey: ["public-client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name, firm_name").eq("id", clientId).maybeSingle();
      return data;
    },
  });

  const { data: firm } = useQuery({
    queryKey: ["public-firm", caId],
    enabled: !!caId,
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("firm_name, phone, email, logo_url").eq("user_id", caId).maybeSingle();
      return data;
    },
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["public-compliance-items", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase.from("compliance_items")
        .select("id, compliance_type, compliance_name, due_date, status, financial_year")
        .eq("client_id", clientId)
        .neq("status", "filed")
        .order("due_date", { ascending: true });
      return (data ?? []);
    },
  });

  const today = startOfDay(new Date());

  const getStatus = (item: any) => {
    if (!item.due_date) return { label: "Upcoming", cls: "bg-blue-100 text-blue-700" };
    const due = startOfDay(parseISO(item.due_date));
    const days = differenceInCalendarDays(due, today);
    if (isBefore(due, today)) return { label: "Overdue", cls: "bg-red-100 text-red-700" };
    if (days <= 7)  return { label: `Due in ${days}d`, cls: "bg-red-100 text-red-600" };
    if (days <= 30) return { label: `Due in ${days}d`, cls: "bg-amber-100 text-amber-700" };
    return { label: `Due ${format(due, "dd MMM")}`, cls: "bg-green-100 text-green-700" };
  };

  if (!clientId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-2">
          <ShieldCheck size={48} className="text-muted-foreground mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Invalid Link</h1>
          <p className="text-muted-foreground text-sm">This compliance calendar link is invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-card border-b border-border px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {firm?.logo_url && <img src={firm.logo_url} alt="Logo" className="w-10 h-10 rounded-md object-contain" />}
            <div>
              <p className="font-bold text-foreground text-lg">{firm?.firm_name ?? "CA Firm"}</p>
              {firm?.phone && <p className="text-xs text-muted-foreground">{firm.phone}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">{client?.name ?? "Client"}</p>
            {client?.firm_name && <p className="text-xs text-muted-foreground">{client.firm_name}</p>}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck size={22} className="text-primary" /> Your Compliance Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upcoming and overdue compliance items as of {format(today, "dd MMM yyyy")}
          </p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>}

        {!isLoading && (items ?? []).length === 0 && (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <p className="text-2xl mb-2">🎉</p>
            <p className="font-semibold text-foreground">All caught up!</p>
            <p className="text-sm text-muted-foreground mt-1">No pending compliance items right now.</p>
          </div>
        )}

        {(items ?? []).map((item: any) => {
          const st = getStatus(item);
          return (
            <div key={item.id} className="bg-card border border-border rounded-xl px-5 py-4 flex items-center justify-between gap-4 shadow-sm">
              <div className="min-w-0">
                <p className="font-semibold text-foreground text-sm">{item.compliance_name ?? item.compliance_type}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {item.financial_year && <span className="text-xs text-muted-foreground">FY {item.financial_year}</span>}
                  {item.due_date && <span className="text-xs text-muted-foreground">Due: {format(parseISO(item.due_date), "dd MMM yyyy")}</span>}
                </div>
              </div>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
            </div>
          );
        })}

        {firm?.phone && (
          <div className="bg-card border border-border rounded-xl p-5 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Questions? Reach out to your CA</p>
            <a
              href={`https://wa.me/91${firm.phone.replace(/\D/g, "")}?text=Hi, I have a query about my compliance calendar`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              💬 WhatsApp {firm.firm_name}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
