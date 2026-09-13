import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Client, type ComplianceItem } from "@/lib/supabase";
import { useMemo, useState } from "react";
import { Plus, X, ShieldCheck } from "lucide-react";
import { differenceInCalendarDays, format, isBefore, parseISO, startOfDay } from "date-fns";

export const Route = createFileRoute("/compliance")({
  head: () => ({ meta: [{ title: "Compliance — PracticeOS" }] }),
  component: CompliancePage,
});

const complianceTypes = [
  "GSTR-1",
  "GSTR-3B",
  "GSTR-9",
  "TDS Deposit",
  "TDS Return Q1",
  "TDS Return Q2",
  "TDS Return Q3",
  "TDS Return Q4",
  "Advance Tax",
  "ITR Filing",
  "Tax Audit",
  "PF Deposit",
  "ESI Deposit",
  "AOC-4",
  "MGT-7",
  "ADT-1",
  "DIR-3 KYC",
  "Form 11 LLP",
  "Form 8 LLP",
  "Other",
];

function getDueStatus(item: Pick<ComplianceItem, "status" | "due_date">): "overdue" | "due-soon" | "filed" | "pending" {
  if (item.status === "filed") return "filed";
  if (!item.due_date) return "pending";
  const today = startOfDay(new Date());
  const dueDate = startOfDay(parseISO(item.due_date));
  if (isBefore(dueDate, today)) return "overdue";
  if (differenceInCalendarDays(dueDate, today) <= 7) return "due-soon";
  return "pending";
}

function getStatusBadgeClass(item: Pick<ComplianceItem, "status" | "due_date">): string {
  const status = getDueStatus(item);

  switch (status) {
    case "overdue":
      return "bg-red-100 text-red-800";
    case "due-soon":
      return "bg-yellow-100 text-yellow-800";
    case "filed":
      return "bg-green-100 text-green-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getStatusLabel(item: Pick<ComplianceItem, "status" | "due_date">): string {
  if (item.status === "filed") return "Filed";

  const status = getDueStatus(item);
  if (status === "overdue") return "Overdue";
  if (status === "due-soon") return "Due Soon";
  return "Pending";
}

function isPendingOverdue(item: Pick<ComplianceItem, "status" | "due_date">): boolean {
  return item.status !== "filed" && !!item.due_date && isBefore(startOfDay(parseISO(item.due_date)), startOfDay(new Date()));
}

function getNextFutureDateForPatterns(patterns: Date[], referenceDate: Date): Date | null {
  const cutoff = startOfDay(referenceDate);
  const upcoming = patterns
    .map((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()))
    .filter((date) => date >= cutoff)
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

function getNextComplianceDateForType(complianceType: string, referenceDate: Date = new Date()): string | null {
  const now = startOfDay(referenceDate);
  const type = complianceType.trim();

  switch (type) {
    case "GSTR-1":
      return new Date(getNextFutureDateForPatterns([
        new Date(now.getFullYear(), now.getMonth(), 11),
        new Date(now.getFullYear(), now.getMonth() + 1, 11),
        new Date(now.getFullYear(), now.getMonth() + 2, 11),
        new Date(now.getFullYear(), now.getMonth() + 3, 11),
        new Date(now.getFullYear(), now.getMonth() + 4, 11),
        new Date(now.getFullYear(), now.getMonth() + 5, 11),
        new Date(now.getFullYear(), now.getMonth() + 6, 11),
        new Date(now.getFullYear(), now.getMonth() + 7, 11),
        new Date(now.getFullYear(), now.getMonth() + 8, 11),
        new Date(now.getFullYear(), now.getMonth() + 9, 11),
        new Date(now.getFullYear(), now.getMonth() + 10, 11),
        new Date(now.getFullYear(), now.getMonth() + 11, 11),
      ], now) ?? new Date(now.getFullYear(), now.getMonth(), 11)).toISOString().slice(0, 10);
    case "GSTR-3B":
      return new Date(getNextFutureDateForPatterns([
        new Date(now.getFullYear(), now.getMonth(), 20),
        new Date(now.getFullYear(), now.getMonth() + 1, 20),
        new Date(now.getFullYear(), now.getMonth() + 2, 20),
        new Date(now.getFullYear(), now.getMonth() + 3, 20),
        new Date(now.getFullYear(), now.getMonth() + 4, 20),
        new Date(now.getFullYear(), now.getMonth() + 5, 20),
        new Date(now.getFullYear(), now.getMonth() + 6, 20),
        new Date(now.getFullYear(), now.getMonth() + 7, 20),
        new Date(now.getFullYear(), now.getMonth() + 8, 20),
        new Date(now.getFullYear(), now.getMonth() + 9, 20),
        new Date(now.getFullYear(), now.getMonth() + 10, 20),
        new Date(now.getFullYear(), now.getMonth() + 11, 20),
      ], now) ?? new Date(now.getFullYear(), now.getMonth(), 20)).toISOString().slice(0, 10);
    case "GSTR-9":
      return new Date(getNextFutureDateForPatterns([
        new Date(now.getFullYear(), 11, 31),
        new Date(now.getFullYear() + 1, 11, 31),
      ], now) ?? new Date(now.getFullYear(), 11, 31)).toISOString().slice(0, 10);
    case "TDS Deposit":
      return new Date(getNextFutureDateForPatterns([
        new Date(now.getFullYear(), now.getMonth(), 7),
        new Date(now.getFullYear(), now.getMonth() + 1, 7),
        new Date(now.getFullYear(), now.getMonth() + 2, 7),
        new Date(now.getFullYear(), now.getMonth() + 3, 7),
        new Date(now.getFullYear(), now.getMonth() + 4, 7),
        new Date(now.getFullYear(), now.getMonth() + 5, 7),
        new Date(now.getFullYear(), now.getMonth() + 6, 7),
        new Date(now.getFullYear(), now.getMonth() + 7, 7),
        new Date(now.getFullYear(), now.getMonth() + 8, 7),
        new Date(now.getFullYear(), now.getMonth() + 9, 7),
        new Date(now.getFullYear(), now.getMonth() + 10, 7),
        new Date(now.getFullYear(), now.getMonth() + 11, 7),
      ], now) ?? new Date(now.getFullYear(), now.getMonth(), 7)).toISOString().slice(0, 10);
    case "TDS Return Q1":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear(), 6, 31), new Date(now.getFullYear() + 1, 6, 31)], now) ?? new Date(now.getFullYear(), 6, 31)).toISOString().slice(0, 10);
    case "TDS Return Q2":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear(), 9, 31), new Date(now.getFullYear() + 1, 9, 31)], now) ?? new Date(now.getFullYear(), 9, 31)).toISOString().slice(0, 10);
    case "TDS Return Q3":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear() + 1, 0, 31), new Date(now.getFullYear() + 2, 0, 31)], now) ?? new Date(now.getFullYear() + 1, 0, 31)).toISOString().slice(0, 10);
    case "TDS Return Q4":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear() + 1, 4, 31), new Date(now.getFullYear() + 2, 4, 31)], now) ?? new Date(now.getFullYear() + 1, 4, 31)).toISOString().slice(0, 10);
    case "PF Deposit":
      return new Date(getNextFutureDateForPatterns([
        new Date(now.getFullYear(), now.getMonth(), 15),
        new Date(now.getFullYear(), now.getMonth() + 1, 15),
        new Date(now.getFullYear(), now.getMonth() + 2, 15),
        new Date(now.getFullYear(), now.getMonth() + 3, 15),
        new Date(now.getFullYear(), now.getMonth() + 4, 15),
        new Date(now.getFullYear(), now.getMonth() + 5, 15),
        new Date(now.getFullYear(), now.getMonth() + 6, 15),
        new Date(now.getFullYear(), now.getMonth() + 7, 15),
        new Date(now.getFullYear(), now.getMonth() + 8, 15),
        new Date(now.getFullYear(), now.getMonth() + 9, 15),
        new Date(now.getFullYear(), now.getMonth() + 10, 15),
        new Date(now.getFullYear(), now.getMonth() + 11, 15),
      ], now) ?? new Date(now.getFullYear(), now.getMonth(), 15)).toISOString().slice(0, 10);
    case "PTEC":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear(), 5, 30), new Date(now.getFullYear() + 1, 5, 30)], now) ?? new Date(now.getFullYear(), 5, 30)).toISOString().slice(0, 10);
    case "Advance Tax Q1":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear(), 5, 15), new Date(now.getFullYear() + 1, 5, 15)], now) ?? new Date(now.getFullYear(), 5, 15)).toISOString().slice(0, 10);
    case "Advance Tax Q2":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear(), 8, 15), new Date(now.getFullYear() + 1, 8, 15)], now) ?? new Date(now.getFullYear(), 8, 15)).toISOString().slice(0, 10);
    case "Advance Tax Q3":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear(), 11, 15), new Date(now.getFullYear() + 1, 11, 15)], now) ?? new Date(now.getFullYear(), 11, 15)).toISOString().slice(0, 10);
    case "Advance Tax Q4":
      return new Date(getNextFutureDateForPatterns([new Date(now.getFullYear() + 1, 2, 15), new Date(now.getFullYear() + 2, 2, 15)], now) ?? new Date(now.getFullYear() + 1, 2, 15)).toISOString().slice(0, 10);
    default:
      return null;
  }
}

function CompliancePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["compliance-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_items")
        .select("*, clients!inner(name, status)")
        .neq("clients.status", "deleted")
        .neq("clients.status", "archived")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ComplianceItem[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-for-compliance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Pick<Client, "id" | "name">[];
    },
  });

  const sortedItems = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => {
      const aOverdue = isPendingOverdue(a) ? 1 : 0;
      const bOverdue = isPendingOverdue(b) ? 1 : 0;

      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [items]);

  const summary = useMemo(() => {
    const pending = sortedItems.filter((item) => item.status !== "filed" && item.status !== "client_deleted");
    const today = startOfDay(new Date());
    const dueThisWeek = pending.filter((item) => {
      if (!item.due_date) return false;
      const dueDate = startOfDay(parseISO(item.due_date));
      return !isBefore(dueDate, today) && differenceInCalendarDays(dueDate, today) <= 7;
    }).length;
    const overdue = pending.filter((item) => isPendingOverdue(item)).length;

    return {
      totalPending: pending.length,
      dueThisWeek,
      overdue,
    };
  }, [sortedItems]);

  const addMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const { error } = await supabase.from("compliance_items").insert({
        ...payload,
        status: "pending",
        filed_date: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-items"] });
      setOpen(false);
    },
  });

  const markFiledMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from("compliance_items")
        .update({ status: "filed", filed_date: new Date().toISOString() })
        .eq("id", id)
        .select("id, client_id, compliance_type, due_date")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updatedItem: any) => {
      qc.invalidateQueries({ queryKey: ["compliance-items"] });

      if (!updatedItem?.client_id || !updatedItem?.compliance_type) return;

      const nextDueDate = getNextComplianceDateForType(updatedItem.compliance_type, new Date(updatedItem.due_date ?? new Date()));
      if (!nextDueDate) return;

      const { data: existingRows, error: existingCheckError } = await supabase
        .from("compliance_items")
        .select("id")
        .eq("client_id", updatedItem.client_id)
        .eq("compliance_type", updatedItem.compliance_type)
        .eq("due_date", nextDueDate)
        .limit(1);

      if (existingCheckError) throw existingCheckError;
      if ((existingRows ?? []).length > 0) return;

      const { error: insertError } = await supabase.from("compliance_items").insert({
        client_id: updatedItem.client_id,
        compliance_type: updatedItem.compliance_type,
        compliance_name: updatedItem.compliance_type,
        due_date: nextDueDate,
        financial_year: new Date(nextDueDate).getFullYear() >= 4 ? `${new Date(nextDueDate).getFullYear()}-${String(new Date(nextDueDate).getFullYear() + 1).slice(-2)}` : `${new Date(nextDueDate).getFullYear() - 1}-${String(new Date(nextDueDate).getFullYear()).slice(-2)}`,
        status: "pending",
        filed_date: null,
      });

      if (insertError) throw insertError;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compliance</h1>
          <p className="text-slate-500 text-sm">Track statutory filing deadlines</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Add Compliance Item
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <p className="text-sm text-slate-500">Total Pending</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-slate-900">{summary.totalPending}</p>
            <ShieldCheck className="text-slate-400" size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <p className="text-sm text-slate-500">Due This Week</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-slate-900">{summary.dueThisWeek}</p>
            <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded-full">Soon</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
          <p className="text-sm text-slate-500">Overdue</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-red-600">{summary.overdue}</p>
            <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded-full">Critical</span>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-slate-500 text-sm">Loading compliance items...</p>}

      {!isLoading && sortedItems.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="font-medium text-slate-700">No compliance items yet.</p>
        </div>
      )}

      {!isLoading && sortedItems.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Compliance Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-900">{item.clients?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{item.compliance_type ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {item.due_date ? format(new Date(item.due_date), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(item)}`}>
                        {getStatusLabel(item)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === "filed" ? (
                        <span className="text-xs text-slate-500">
                          Filed {item.filed_date ? format(new Date(item.filed_date), "dd MMM yyyy") : ""}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => markFiledMutation.mutate({ id: item.id })}
                          disabled={markFiledMutation.isPending}
                          className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Mark Filed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <ComplianceModal
          clients={clients ?? []}
          onClose={() => setOpen(false)}
          onSubmit={addMutation.mutate}
          pending={addMutation.isPending}
        />
      )}
    </div>
  );
}

function ComplianceModal({
  clients,
  onClose,
  onSubmit,
  pending,
}: {
  clients: Pick<Client, "id" | "name">[];
  onClose: () => void;
  onSubmit: (data: Record<string, string>) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    client_id: "",
    compliance_type: "",
    due_date: "",
    financial_year: "",
    notes: "",
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Add Compliance Item</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const selectedType = form.compliance_type || "";
            onSubmit({
              client_id: form.client_id,
              compliance_type: selectedType,
              compliance_name: selectedType,
              due_date: form.due_date,
              financial_year: form.financial_year,
              notes: form.notes,
            });
          }}
          className="p-5 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
              <select
                required
                value={form.client_id}
                onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Compliance Type *</label>
              <select
                required
                value={form.compliance_type}
                onChange={(e) => setForm({ ...form, compliance_type: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a compliance type</option>
                {complianceTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Due Date *</label>
              <input
                required
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Financial Year</label>
              <input
                type="text"
                value={form.financial_year}
                onChange={(e) => setForm({ ...form, financial_year: e.target.value })}
                placeholder="2025-26"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save Compliance Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
