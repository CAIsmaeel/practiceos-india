import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Invoice, type Client, type FirmSettings, getCurrentUserId } from "@/lib/supabase";
import { useState, useMemo } from "react";
import { Plus, X, CheckCircle2, Download, Pencil } from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";

export const Route = createFileRoute("/invoices")({
  head: () => ({ meta: [{ title: "Invoices — PracticeOS" }] }),
  component: InvoicesPage,
});

const statusColors: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-800",
  Overdue: "bg-red-100 text-red-800",
  Paid: "bg-green-100 text-green-800",
};

const GST_RATES = [0, 5, 9, 12, 18];

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

function getDisplayStatus(invoice: Invoice): string {
  if (isInvoicePaid(invoice)) return "Paid";
  if (isInvoiceOverdue(invoice)) return "Overdue";
  return "Pending";
}

function InvoicesPage() {
  const qc = useQueryClient();
  const [showPaid, setShowPaid] = useState(false);
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; invoice?: Invoice | null } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", user?.id ?? "")
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as FirmSettings | null;
    },
  });

  const sorted = useMemo(() => {
    if (!invoices) return [];
    return [...invoices].sort((a, b) => {
      const aOverdue = isInvoiceOverdue(a) ? 1 : 0;
      const bOverdue = isInvoiceOverdue(b) ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [invoices]);

  const paidCount = useMemo(() => invoices?.filter((inv) => isInvoicePaid(inv)).length ?? 0, [invoices]);

  const visibleInvoices = useMemo(() => {
    if (!sorted) return [];
    return sorted.filter((invoice) => showPaid || !isInvoicePaid(invoice));
  }, [sorted, showPaid]);

  const summary = useMemo(() => {
    if (!invoices) return { outstanding: 0, overdueCount: 0, overdueAmount: 0 };
    let outstanding = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    for (const inv of invoices) {
      if (isInvoicePaid(inv)) continue;
      const total = Number(inv.total_amount ?? inv.amount ?? 0);
      outstanding += total;
      if (isInvoiceOverdue(inv)) {
        overdueCount += 1;
        overdueAmount += total;
      }
    }
    return { outstanding, overdueCount, overdueAmount };
  }, [invoices]);

  const addMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const userId = await getCurrentUserId();
      const prefix = (firmSettings?.invoice_prefix || "INV").trim() || "INV";
      const { count, error: countError } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true });
      if (countError) throw countError;

      const sequence = (count ?? 0) + 1;
      const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(sequence).padStart(3, "0")}`;

      const { error } = await supabase.from("invoices").insert({
        ...payload,
        invoice_number: invoiceNumber,
        status: "Unpaid",
        user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setModalState(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const { error } = await supabase.from("invoices").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setModalState(null);
    },
  });

  const loadImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const handleDownload = async (invoice: Invoice) => {
    try {
      setDownloadingId(invoice.id);

      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        alert("Please allow popups for this site");
        return;
      }

      printWindow.document.write(`
        <html>
          <body style="font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; font-size:18px; color:#666;">
            Loading invoice...
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const { data: settingsData } = await supabase
        .from("settings")
        .select("*")
        .eq("user_id", currentUser?.id ?? "")
        .limit(1);
      const firm = settingsData?.[0];

      const firmName = firm?.firm_name ?? "Your Firm Name";
      const gstin = firm?.gst_number ?? "—";
      const pan = firm?.ca_reg_number ?? "—";
      const address = firm?.address ?? "";
      const phone = firm?.phone ?? "";
      const email = firm?.email ?? "";
      const invoiceDate = invoice.created_at ? format(new Date(invoice.created_at), "dd MMM yyyy") : "—";
      const base = Number(invoice.base_amount ?? invoice.amount ?? 0);
      const gstRate = Number((invoice as any).gst_rate ?? 0);
      const gstAmount = Number(invoice.gst_amount ?? 0);
      const total = Number(invoice.total_amount ?? invoice.amount ?? 0);
      const description = invoice.description ?? "Professional services";

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${invoice.invoice_number ?? ""}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      color: #111;
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 24px;
      border-bottom: 2px solid #111;
      padding-bottom: 16px;
    }
    .firm-name {
      font-size: 22px;
      font-weight: bold;
    }
    .firm-details {
      font-size: 12px;
      color: #444;
      margin-top: 4px;
      line-height: 1.6;
    }
    .invoice-label {
      font-size: 20px;
      font-weight: bold;
      letter-spacing: 3px;
      text-align: center;
      border-top: 2px solid #111;
      border-bottom: 2px solid #111;
      padding: 8px 0;
      margin: 16px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .bill-to {
      background: #f8f8f8;
      padding: 12px;
      border-radius: 4px;
      margin-bottom: 20px;
      font-size: 13px;
    }
    .bill-to-title {
      font-weight: bold;
      margin-bottom: 6px;
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
      font-size: 13px;
    }
    thead tr {
      background: #f3f4f6;
      border-bottom: 2px solid #111;
    }
    th { padding: 10px 8px; }
    td { padding: 10px 8px; border-bottom: 1px solid #eee; }
    .text-left { text-align: left; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .grand-total {
      font-weight: bold;
      border-top: 2px solid #111;
      font-size: 14px;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="firm-name">${firmName}</div>
      <div class="firm-details">
        ${address ? `${address.replace(/\n/g, "<br />")}` : ""}
        ${phone ? `<br />Phone: ${phone}` : ""}
        ${email ? `<br />Email: ${email}` : ""}
      </div>
    </div>
    <div style="text-align:right; font-size:13px;">
      <div>GSTIN: ${gstin}</div>
      <div>PAN/CA Reg: ${pan}</div>
    </div>
  </div>

  <div class="invoice-label">TAX INVOICE</div>

  <div class="meta-row">
    <div><strong>Invoice No:</strong> ${invoice.invoice_number ?? "—"}</div>
    <div><strong>Date:</strong> ${invoiceDate}</div>
  </div>

  <div class="bill-to">
    <div class="bill-to-title">Bill To</div>
    <div>${invoice.clients?.name ?? "—"}</div>
    <div>${invoice.clients?.email ?? ""}</div>
    <div>${invoice.clients?.phone ?? ""}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="text-left" style="width:40%">Description</th>
        <th class="text-right" style="width:15%">Amount</th>
        <th class="text-center" style="width:10%">GST%</th>
        <th class="text-right" style="width:15%">GST Amt</th>
        <th class="text-right" style="width:20%">Total</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="text-left">${description}</td>
        <td class="text-right">₹${base.toLocaleString("en-IN")}</td>
        <td class="text-center">${gstRate}%</td>
        <td class="text-right">₹${gstAmount.toLocaleString("en-IN")}</td>
        <td class="text-right">₹${total.toLocaleString("en-IN")}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr class="grand-total">
        <td colspan="4" class="text-right">Grand Total</td>
        <td class="text-right">₹${total.toLocaleString("en-IN")}</td>
      </tr>
    </tfoot>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 800);
    };
  </script>
</body>
</html>`;

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
      const { error } = await supabase
        .from("invoices")
        .update({ status: "Paid", payment_date: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-slate-500 text-sm">Track invoices and payments</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPaid((prev) => !prev)}
            className={`inline-flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium border ${showPaid ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
          >
            Show Paid ({paidCount})
          </button>
          <button
            onClick={() => setModalState({ mode: "create" })}
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            <Plus size={16} /> Create Invoice
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-slate-500 font-medium">Total Outstanding</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{formatINR(summary.outstanding)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-slate-500 font-medium">Overdue Count</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{summary.overdueCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <p className="text-sm text-slate-500 font-medium">Overdue Amount</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatINR(summary.overdueAmount)}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Invoice No</th>
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Base Amount</th>
              <th className="px-5 py-3 font-medium">GST</th>
              <th className="px-5 py-3 font-medium">Total (₹)</th>
              <th className="px-5 py-3 font-medium">Due Date</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-500">Loading...</td>
              </tr>
            )}
            {!isLoading && visibleInvoices.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-slate-500">No invoices yet.</td>
              </tr>
            )}
            {visibleInvoices.map((inv) => {
              const displayStatus = getDisplayStatus(inv);
              const base = Number(inv.base_amount ?? inv.amount ?? 0);
              const gst = Number(inv.gst_amount ?? 0);
              const total = Number(inv.total_amount ?? inv.amount ?? 0);
              return (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {inv.invoice_number ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{inv.clients?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-slate-700">{formatINR(base)}</td>
                  <td className="px-5 py-3 text-slate-700">{formatINR(gst)}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">{formatINR(total)}</td>
                  <td className="px-5 py-3 text-slate-700">
                    {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusColors[displayStatus] ?? "bg-gray-100 text-gray-700"}`}>
                      {displayStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setModalState({ mode: "edit", invoice: inv })}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        onClick={() => handleDownload(inv)}
                        disabled={downloadingId === inv.id}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 font-medium disabled:opacity-50"
                      >
                        <Download size={14} /> {downloadingId === inv.id ? "Generating..." : "Download PDF"}
                      </button>
                      {inv.status !== "Paid" && (
                        <button
                          onClick={() => payMutation.mutate({ id: inv.id })}
                          disabled={payMutation.isPending}
                          className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> Mark Paid
                        </button>
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

function InvoiceModal({
  clients,
  mode,
  initialInvoice,
  onClose,
  onSubmit,
  pending,
}: {
  clients: Pick<Client, "id" | "name">[];
  mode: "create" | "edit";
  initialInvoice?: Invoice | null;
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    client_id: initialInvoice?.client_id ?? "",
    description: initialInvoice?.description ?? "",
    base_amount: String(initialInvoice?.base_amount ?? initialInvoice?.amount ?? ""),
    gst_rate: String(initialInvoice?.gst_rate ?? "0"),
    due_date: initialInvoice?.due_date ?? "",
    notes: initialInvoice?.notes ?? "",
  });

  const base = parseFloat(form.base_amount) || 0;
  const rate = parseFloat(form.gst_rate) || 0;
  const gstAmount = (base * rate) / 100;
  const totalAmount = base + gstAmount;
  const cgst = rate > 0 ? gstAmount / 2 : 0;
  const sgst = rate > 0 ? gstAmount / 2 : 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-slate-900">{mode === "edit" ? "Edit Invoice" : "Create Invoice"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              client_id: form.client_id,
              description: form.description || null,
              base_amount: base,
              gst_rate: rate,
              gst_amount: gstAmount,
              total_amount: totalAmount,
              amount: totalAmount,
              due_date: form.due_date || null,
              notes: form.notes || null,
              status: mode === "edit" ? initialInvoice?.status ?? "Pending" : "Pending",
            });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Client <span className="text-red-500">*</span></label>
            <select
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Service Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. GST Return Filing — Q2"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Base Amount (₹) <span className="text-red-500">*</span></label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.base_amount}
              onChange={(e) => setForm({ ...form, base_amount: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">GST Rate</label>
            <select
              value={form.gst_rate}
              onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {GST_RATES.map((r) => (
                <option key={r} value={r}>{r}%</option>
              ))}
            </select>
          </div>
          <div className="bg-slate-50 rounded-md p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">GST Amount</span>
              <span className="font-medium text-slate-700">{formatINR(gstAmount)}</span>
            </div>
            {rate > 0 && (
              <>
                <div className="flex justify-between text-xs text-slate-500 pl-3">
                  <span>CGST ({rate / 2}%)</span>
                  <span>{formatINR(cgst)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500 pl-3">
                  <span>SGST ({rate / 2}%)</span>
                  <span>{formatINR(sgst)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1.5">
              <span className="font-medium text-slate-700">Total Amount</span>
              <span className="font-bold text-slate-900">{formatINR(totalAmount)}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update Invoice" : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
