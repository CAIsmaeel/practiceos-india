import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Invoice, type Client, type FirmSettings, getCurrentUserId } from "@/lib/supabase";
import { useState, useMemo } from "react";
import { Plus, X, CheckCircle2, Download, Pencil, MessageCircle, Trash2 } from "lucide-react";
import { format, isBefore, startOfDay, differenceInDays } from "date-fns";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Firmora" }] }),
  component: InvoicesPage,
});

const GST_RATES = [0, 5, 9, 12, 18];
const AGING_THRESHOLDS = [30, 60, 90];

type LineItem = {
  description: string;
  base_amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
};

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);
}

function normalizeInvoiceStatus(status?: string | null): string {
  return (status ?? "").trim().toLowerCase();
}

function isInvoicePaid(invoice: Pick<Invoice, "status">): boolean {
  return normalizeInvoiceStatus(invoice.status) === "paid";
}

function isInvoiceOverdue(invoice: Pick<Invoice, "due_date" | "status">): boolean {
  if (isInvoicePaid(invoice) || !invoice.due_date) return false;
  return isBefore(new Date(invoice.due_date), startOfDay(new Date()));
}

function getOverdueDays(invoice: Invoice): number | null {
  if (isInvoicePaid(invoice) || !invoice.due_date) return null;
  const days = differenceInDays(new Date(), new Date(invoice.due_date));
  return days > 0 ? days : null;
}

function getAgingTag(days: number | null): { label: string; color: string } | null {
  if (days === null) return null;
  if (days >= 90) return { label: "90+ days", color: "bg-red-200 text-red-900" };
  if (days >= 60) return { label: "60-89 days", color: "bg-red-100 text-red-800" };
  if (days >= 30) return { label: "30-59 days", color: "bg-orange-100 text-orange-800" };
  return { label: `${days}d overdue`, color: "bg-yellow-100 text-yellow-800" };
}

function getDisplayStatus(invoice: Invoice): string {
  if (isInvoicePaid(invoice)) return "Paid";
  if (isInvoiceOverdue(invoice)) return "Overdue";
  return "Pending";
}

function getWhatsAppMessage(inv: Invoice, overdueDays: number | null, firmName: string): string {
  const clientName = inv.clients?.name ?? "Sir/Ma'am";
  const amount = formatINR(Number(inv.total_amount ?? inv.amount ?? 0));
  const invoiceNo = inv.invoice_number ?? "";
  const dueDate = inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "";

  if (overdueDays === null) {
    return `Dear ${clientName},\n\nThis is a gentle reminder that Invoice ${invoiceNo} of ${amount} is due on ${dueDate}.\n\nKindly arrange payment at your earliest convenience.\n\nThank you,\n${firmName}`;
  }
  if (overdueDays > 60) {
    return `Dear ${clientName},\n\nInvoice ${invoiceNo} of ${amount} has been pending for ${overdueDays} days (due: ${dueDate}).\n\nWe request you to kindly settle this at the earliest.\n\nThank you,\n${firmName}`;
  }
  return `Dear ${clientName},\n\nThis is a reminder that Invoice ${invoiceNo} of ${amount} was due on ${dueDate} and is now ${overdueDays} days overdue.\n\nKindly process the payment at your earliest.\n\nThank you,\n${firmName}`;
}

function emptyLine(): LineItem {
  return { description: "", base_amount: 0, gst_rate: 0, gst_amount: 0, total_amount: 0 };
}

function calcLine(line: LineItem): LineItem {
  const gst = (line.base_amount * line.gst_rate) / 100;
  return { ...line, gst_amount: gst, total_amount: line.base_amount + gst };
}

function InvoicesPage() {
  const qc = useQueryClient();
  const [showPaid, setShowPaid] = useState(false);
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; invoice?: Invoice | null } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [agingFilter, setAgingFilter] = useState<"all" | "30" | "60" | "90">("all");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("invoices")
        .select("*, clients(name, firm_name, email, phone)")
        .eq("user_id", userId ?? "")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-for-select"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as Pick<Client, "id" | "name">[];
    },
  });

  const { data: firmSettings } = useQuery({
    queryKey: ["firm-settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("settings").select("*").eq("user_id", user?.id ?? "").limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as FirmSettings | null;
    },
  });

  const firmName = firmSettings?.firm_name ?? "CA Practice";

  const sorted = useMemo(() => {
    if (!invoices) return [];
    return [...invoices].sort((a, b) => {
      const aO = isInvoiceOverdue(a) ? 1 : 0;
      const bO = isInvoiceOverdue(b) ? 1 : 0;
      if (aO !== bO) return bO - aO;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [invoices]);

  const paidCount = useMemo(() => invoices?.filter(isInvoicePaid).length ?? 0, [invoices]);

  const visibleInvoices = useMemo(() => {
    if (!sorted) return [];
    return sorted.filter((inv) => {
      if (!showPaid && isInvoicePaid(inv)) return false;
      if (agingFilter === "all") return true;
      const days = getOverdueDays(inv);
      if (days === null) return false;
      if (agingFilter === "30") return days >= 30 && days < 60;
      if (agingFilter === "60") return days >= 60 && days < 90;
      if (agingFilter === "90") return days >= 90;
      return true;
    });
  }, [sorted, showPaid, agingFilter]);

  const summary = useMemo(() => {
    if (!invoices) return { outstanding: 0, overdueCount: 0, overdueAmount: 0, aging30: 0, aging60: 0, aging90: 0 };
    let outstanding = 0, overdueCount = 0, overdueAmount = 0, aging30 = 0, aging60 = 0, aging90 = 0;
    for (const inv of invoices) {
      if (isInvoicePaid(inv)) continue;
      const total = Number(inv.total_amount ?? inv.amount ?? 0);
      outstanding += total;
      const days = getOverdueDays(inv);
      if (days !== null) {
        overdueCount++; overdueAmount += total;
        if (days >= 90) aging90 += total;
        else if (days >= 60) aging60 += total;
        else if (days >= 30) aging30 += total;
      }
    }
    return { outstanding, overdueCount, overdueAmount, aging30, aging60, aging90 };
  }, [invoices]);

  const handleWhatsApp = (inv: Invoice) => {
    const days = getOverdueDays(inv);
    const msg = getWhatsAppMessage(inv, days, firmName);
    const phone = inv.clients?.phone?.replace(/\D/g, "") ?? "";
    const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const addMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const userId = await getCurrentUserId();
      const prefix = (firmSettings?.invoice_prefix || "INV").trim() || "INV";
      const { count, error: countError } = await supabase.from("invoices").select("id", { count: "exact", head: true });
      if (countError) throw countError;
      const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(3, "0")}`;
      const { error } = await supabase.from("invoices").insert({ ...payload, invoice_number: invoiceNumber, status: "Unpaid", user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); setModalState(null); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { error } = await supabase.from("invoices").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); setModalState(null); },
  });

  const handleDownload = async (invoice: Invoice) => {
    try {
      setDownloadingId(invoice.id);
      const printWindow = window.open("", "_blank");
      if (!printWindow) { alert("Please allow popups"); return; }
      printWindow.document.write(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;font-size:18px;color:#666;">Loading invoice...</body></html>`);
      printWindow.document.close();

      const { data: { user: cu } } = await supabase.auth.getUser();
      const { data: sd } = await supabase.from("settings").select("*").eq("user_id", cu?.id ?? "").limit(1);
      const firm = sd?.[0];
      const firmNamePdf = firm?.firm_name ?? "Your Firm Name";
      const gstin = firm?.gst_number ?? "—";
      const pan = firm?.ca_reg_number ?? "—";
      const address = firm?.address ?? "";
      const phone = firm?.phone ?? "";
      const email = firm?.email ?? "";
      const logoUrl = (firm as any)?.logo_url ?? null;
      const invoiceDate = invoice.created_at ? format(new Date(invoice.created_at), "dd MMM yyyy") : "—";

      // Convert logo to base64 so it works in print window
      let logoBase64 = "";
      if (logoUrl) {
        try {
          const res = await fetch(logoUrl);
          const blob = await res.blob();
          logoBase64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch { logoBase64 = ""; }
      }

      // Line items support
      const lineItems: LineItem[] = (invoice as any).line_items ?? [];
      const hasLines = lineItems.length > 0;

      const lineRows = hasLines
        ? lineItems.map(li => `<tr><td class="text-left">${li.description}</td><td class="text-right">₹${li.base_amount.toLocaleString("en-IN")}</td><td class="text-center">${li.gst_rate}%</td><td class="text-right">₹${li.gst_amount.toLocaleString("en-IN")}</td><td class="text-right">₹${li.total_amount.toLocaleString("en-IN")}</td></tr>`).join("")
        : `<tr><td class="text-left">${invoice.description ?? "Professional services"}</td><td class="text-right">₹${Number(invoice.base_amount ?? invoice.amount ?? 0).toLocaleString("en-IN")}</td><td class="text-center">${Number((invoice as any).gst_rate ?? 0)}%</td><td class="text-right">₹${Number(invoice.gst_amount ?? 0).toLocaleString("en-IN")}</td><td class="text-right">₹${Number(invoice.total_amount ?? invoice.amount ?? 0).toLocaleString("en-IN")}</td></tr>`;

      const total = Number(invoice.total_amount ?? invoice.amount ?? 0);

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Invoice ${invoice.invoice_number ?? ""}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#111}.header{display:flex;justify-content:space-between;margin-bottom:24px;border-bottom:2px solid #111;padding-bottom:16px}.firm-name{font-size:22px;font-weight:bold}.firm-details{font-size:12px;color:#444;margin-top:4px;line-height:1.6}.invoice-label{font-size:20px;font-weight:bold;letter-spacing:3px;text-align:center;border-top:2px solid #111;border-bottom:2px solid #111;padding:8px 0;margin:16px 0}.meta-row{display:flex;justify-content:space-between;margin-bottom:16px;font-size:13px}.bill-to{background:#f8f8f8;padding:12px;border-radius:4px;margin-bottom:20px;font-size:13px}.bill-to-title{font-weight:bold;margin-bottom:6px;font-size:14px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}thead tr{background:#f3f4f6;border-bottom:2px solid #111}th{padding:10px 8px}td{padding:10px 8px;border-bottom:1px solid #eee}.text-left{text-align:left}.text-right{text-align:right}.text-center{text-align:center}.grand-total{font-weight:bold;border-top:2px solid #111;font-size:14px}</style>
      </head><body>
      <div class="header"><div style="display:flex;align-items:center;gap:12px">${logoBase64 ? `<img src="${logoBase64}" style="width:60px;height:60px;object-fit:contain;" alt="logo"/>` : ""}<div><div class="firm-name">${firmNamePdf}</div><div class="firm-details">${address?address.replace(/\n/g,"<br/>"):""}${phone?`<br/>Phone: ${phone}`:""}${email?`<br/>Email: ${email}`:""}</div></div></div>
      <div style="text-align:right;font-size:13px"><div>GSTIN: ${gstin}</div><div>PAN/CA Reg: ${pan}</div></div></div>
      <div class="invoice-label">TAX INVOICE</div>
      <div class="meta-row"><div><strong>Invoice No:</strong> ${invoice.invoice_number ?? "—"}</div><div><strong>Date:</strong> ${invoiceDate}</div></div>
      <div class="bill-to"><div class="bill-to-title">Bill To</div><div>${invoice.clients?.name ?? "—"}</div><div>${invoice.clients?.email ?? ""}</div><div>${invoice.clients?.phone ?? ""}</div></div>
      <table><thead><tr><th class="text-left" style="width:40%">Description</th><th class="text-right" style="width:15%">Amount</th><th class="text-center" style="width:10%">GST%</th><th class="text-right" style="width:15%">GST Amt</th><th class="text-right" style="width:20%">Total</th></tr></thead>
      <tbody>${lineRows}</tbody>
      <tfoot><tr class="grand-total"><td colspan="4" class="text-right">Grand Total</td><td class="text-right">₹${total.toLocaleString("en-IN")}</td></tr></tfoot></table>
      <script>window.onload=function(){setTimeout(function(){window.print();},800);}</script></body></html>`;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
    } catch (err) {
      console.error("PDF error:", err);
      alert("Could not generate invoice. Try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  const payMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from("invoices").update({ status: "Paid", payment_date: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground text-sm">Track invoices and payments</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowPaid((p) => !p)}
            className={`inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium border ${showPaid ? "bg-sidebar text-primary-foreground border-sidebar" : "bg-card text-foreground border-input hover:bg-muted"}`}>
            Show Paid ({paidCount})
          </button>
          <button onClick={() => setModalState({ mode: "create" })}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
            <Plus size={16} /> Create Invoice
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground font-medium">Total Outstanding</p>
          <p className="text-xl font-bold text-foreground mt-1">{formatINR(summary.outstanding)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">Overdue Count</p>
          <p className="text-xl font-bold text-red-600 mt-1">{summary.overdueCount}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium">Overdue Amount</p>
          <p className="text-xl font-bold text-red-600 mt-1">{formatINR(summary.overdueAmount)}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 shadow-sm cursor-pointer hover:bg-yellow-100" onClick={() => setAgingFilter(agingFilter === "30" ? "all" : "30")}>
          <p className="text-xs text-yellow-700 font-medium">30-59 Days</p>
          <p className="text-xl font-bold text-yellow-800 mt-1">{formatINR(summary.aging30)}</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 shadow-sm cursor-pointer hover:bg-orange-100" onClick={() => setAgingFilter(agingFilter === "60" ? "all" : "60")}>
          <p className="text-xs text-orange-700 font-medium">60-89 Days</p>
          <p className="text-xl font-bold text-orange-800 mt-1">{formatINR(summary.aging60)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 shadow-sm cursor-pointer hover:bg-red-100" onClick={() => setAgingFilter(agingFilter === "90" ? "all" : "90")}>
          <p className="text-xs text-red-700 font-medium">90+ Days</p>
          <p className="text-xl font-bold text-red-800 mt-1">{formatINR(summary.aging90)}</p>
        </div>
      </div>

      {agingFilter !== "all" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtering: <strong>{agingFilter}+ days overdue</strong></span>
          <button onClick={() => setAgingFilter("all")} className="text-xs text-primary hover:underline">Clear filter</button>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-left">
            <tr>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Invoice No</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Client</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Services</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Total (₹)</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Due Date</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && visibleInvoices.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No invoices found.</td></tr>}
            {visibleInvoices.map((inv) => {
              const displayStatus = getDisplayStatus(inv);
              const total = Number(inv.total_amount ?? inv.amount ?? 0);
              const overdueDays = getOverdueDays(inv);
              const agingTag = getAgingTag(overdueDays);
              const lineItems: LineItem[] = (inv as any).line_items ?? [];
              const servicesSummary = lineItems.length > 0
                ? lineItems.map(l => l.description).filter(Boolean).join(", ")
                : (inv.description ?? "—");

              return (
                <tr key={inv.id} className="hover:bg-muted">
                  <td className="px-5 py-3 font-medium text-foreground">{inv.invoice_number ?? "—"}</td>
                  <td className="px-5 py-3 text-foreground">{inv.clients?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground text-xs max-w-[180px] truncate" title={servicesSummary}>{servicesSummary}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{formatINR(total)}</td>
                  <td className="px-5 py-3 text-foreground">{inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                        displayStatus === "Paid" ? "bg-green-100 text-green-800" :
                        displayStatus === "Overdue" ? "bg-red-100 text-red-800" :
                        "bg-yellow-100 text-yellow-800"}`}>
                        {displayStatus}
                      </span>
                      {agingTag && <span className={`px-2 py-1 rounded-md text-xs font-medium ${agingTag.color}`}>{agingTag.label}</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => setModalState({ mode: "edit", invoice: inv })}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium">
                        <Pencil size={14} /> Edit
                      </button>
                      <button onClick={() => handleDownload(inv)} disabled={downloadingId === inv.id}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-medium disabled:opacity-50">
                        <Download size={14} /> {downloadingId === inv.id ? "..." : "PDF"}
                      </button>
                      {!isInvoicePaid(inv) && (
                        <>
                          <button onClick={() => payMutation.mutate({ id: inv.id })} disabled={payMutation.isPending}
                            className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50">
                            <CheckCircle2 size={14} /> Paid
                          </button>
                          <button onClick={() => handleWhatsApp(inv)}
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                            <MessageCircle size={14} /> Remind
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalState && (
        <InvoiceModal
          clients={clients ?? []}
          mode={modalState.mode}
          initialInvoice={modalState.invoice ?? undefined}
          onClose={() => setModalState(null)}
          onSubmit={(payload) => {
            if (modalState.mode === "edit" && modalState.invoice?.id) {
              updateMutation.mutate({ id: modalState.invoice.id, payload });
              return;
            }
            addMutation.mutate(payload);
          }}
          pending={addMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  );
}

function InvoiceModal({ clients, mode, initialInvoice, onClose, onSubmit, pending }: {
  clients: Pick<Client, "id" | "name">[];
  mode: "create" | "edit";
  initialInvoice?: Invoice | null;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const existingLines: LineItem[] = (initialInvoice as any)?.line_items ?? [];
  const [clientId, setClientId] = useState(initialInvoice?.client_id ?? "");
  const [dueDate, setDueDate] = useState(initialInvoice?.due_date ?? "");
  const [notes, setNotes] = useState(initialInvoice?.notes ?? "");
  const [lines, setLines] = useState<LineItem[]>(
    existingLines.length > 0 ? existingLines : [emptyLine()]
  );

  // Compliance items for selected client
  const { data: complianceItems } = useQuery({
    queryKey: ["compliance-for-invoice", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("compliance_items")
        .select("id, compliance_type, due_date")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .order("due_date", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });

  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setLines((prev) => {
      const updated = [...prev];
      const line = { ...updated[i], [field]: typeof value === "string" && field !== "description" ? parseFloat(value) || 0 : value };
      updated[i] = calcLine(line as LineItem);
      return updated;
    });
  };

  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));

  const addComplianceLine = (type: string) => {
    setLines((p) => [...p, calcLine({ description: type, base_amount: 0, gst_rate: 18, gst_amount: 0, total_amount: 0 })]);
  };

  const totals = useMemo(() => {
    const base = lines.reduce((s, l) => s + l.base_amount, 0);
    const gst = lines.reduce((s, l) => s + l.gst_amount, 0);
    const total = lines.reduce((s, l) => s + l.total_amount, 0);
    return { base, gst, total };
  }, [lines]);

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      client_id: clientId,
      line_items: lines,
      description: lines.map(l => l.description).filter(Boolean).join(", "),
      base_amount: totals.base,
      gst_amount: totals.gst,
      total_amount: totals.total,
      amount: totals.total,
      due_date: dueDate || null,
      notes: notes || null,
      status: mode === "edit" ? initialInvoice?.status ?? "Pending" : "Pending",
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="font-semibold text-foreground">{mode === "edit" ? "Edit Invoice" : "Create Invoice"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* Client + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-foreground mb-1">Client *</label>
              <select required value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass}>
                <option value="">Select client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-foreground mb-1">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          {/* Quick Add from Compliance */}
          {clientId && complianceItems && complianceItems.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">⚡ Quick Add — Pending Compliance</p>
              <div className="flex flex-wrap gap-2">
                {complianceItems.map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addComplianceLine(item.compliance_type)}
                    className="text-xs bg-white border border-blue-300 text-blue-700 px-2 py-1 rounded hover:bg-blue-100"
                  >
                    + {item.compliance_type}
                    {item.due_date ? ` (${format(new Date(item.due_date), "dd MMM")})` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-foreground">Services / Line Items</p>
              <button type="button" onClick={addLine}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus size={12} /> Add Line
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <input
                      value={line.description}
                      onChange={(e) => updateLine(i, "description", e.target.value)}
                      placeholder="Service description (e.g. GSTR-3B Filing Oct)"
                      className={`${inputClass} flex-1`}
                    />
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Base Amount (₹)</label>
                      <input type="number" min="0" step="0.01"
                        value={line.base_amount || ""}
                        onChange={(e) => updateLine(i, "base_amount", e.target.value)}
                        className={inputClass} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">GST Rate</label>
                      <select value={line.gst_rate} onChange={(e) => updateLine(i, "gst_rate", e.target.value)} className={inputClass}>
                        {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Line Total</label>
                      <div className="w-full border border-input rounded-md px-3 py-2 text-sm bg-muted text-foreground font-medium">
                        {formatINR(line.total_amount)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatINR(totals.base)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>GST</span>
              <span>{formatINR(totals.gst)}</span>
            </div>
            <div className="flex justify-between font-bold text-foreground border-t border-border pt-2 text-base">
              <span>Grand Total</span>
              <span>{formatINR(totals.total)}</span>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update Invoice" : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
