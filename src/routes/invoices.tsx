import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Invoice, type Client } from "@/lib/supabase";
import { useState, useMemo } from "react";
import { Plus, X, CheckCircle2 } from "lucide-react";
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

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  }).format(amount);
}

function getDisplayStatus(invoice: Invoice): string {
  if (invoice.status === "Paid") return "Paid";
  if (invoice.due_date && isBefore(new Date(invoice.due_date), startOfDay(new Date()))) {
    return "Overdue";
  }
  return "Pending";
}

function InvoicesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, clients(name, firm_name)")
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

  const sorted = useMemo(() => {
    if (!invoices) return [];
    const today = startOfDay(new Date());
    return [...invoices].sort((a, b) => {
      const aOverdue =
        a.status !== "Paid" && a.due_date && isBefore(new Date(a.due_date), today) ? 1 : 0;
      const bOverdue =
        b.status !== "Paid" && b.due_date && isBefore(new Date(b.due_date), today) ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [invoices]);

  const summary = useMemo(() => {
    if (!invoices) return { outstanding: 0, overdueCount: 0, overdueAmount: 0 };
    const today = startOfDay(new Date());
    let outstanding = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    for (const inv of invoices) {
      if (inv.status === "Paid") continue;
      outstanding += Number(inv.amount);
      if (inv.due_date && isBefore(new Date(inv.due_date), today)) {
        overdueCount += 1;
        overdueAmount += Number(inv.amount);
      }
    }
    return { outstanding, overdueCount, overdueAmount };
  }, [invoices]);

  const addMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from("invoices").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setOpen(false);
    },
  });

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
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Create Invoice
        </button>
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
              <th className="px-5 py-3 font-medium">Client</th>
              <th className="px-5 py-3 font-medium">Amount</th>
              <th className="px-5 py-3 font-medium">Due Date</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Reminders</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                  No invoices yet.
                </td>
              </tr>
            )}
            {sorted.map((inv) => {
              const displayStatus = getDisplayStatus(inv);
              return (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {inv.clients?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-700 font-medium">
                    {formatINR(Number(inv.amount))}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {inv.due_date ? format(new Date(inv.due_date), "dd MMM yyyy") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-medium ${
                        statusColors[displayStatus] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {displayStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{inv.reminder_count ?? 0}</td>
                  <td className="px-5 py-3">
                    {inv.status !== "Paid" && (
                      <button
                        onClick={() => payMutation.mutate({ id: inv.id })}
                        disabled={payMutation.isPending}
                        className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} /> Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <InvoiceModal
          clients={clients ?? []}
          onClose={() => setOpen(false)}
          onSubmit={addMutation.mutate}
          pending={addMutation.isPending}
        />
      )}
    </div>
  );
}

function InvoiceModal({
  clients,
  onClose,
  onSubmit,
  pending,
}: {
  clients: Pick<Client, "id" | "name">[];
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    client_id: "",
    amount: "",
    due_date: "",
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Create Invoice</h2>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              client_id: form.client_id,
              amount: parseFloat(form.amount),
              due_date: form.due_date || null,
              status: "Pending",
            });
          }}
          className="p-5 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Client <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Amount (₹) <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
