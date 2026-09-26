import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Client, type ComplianceItem, getCurrentUserId } from "@/lib/supabase";
import { useMemo, useState } from "react";
import { Plus, X, ShieldCheck, Download } from "lucide-react";
import { differenceInCalendarDays, format, isBefore, parseISO, startOfDay } from "date-fns";

export const Route = createFileRoute("/compliance")({
  head: () => ({ meta: [{ title: "Compliance — Firmora" }] }),
  component: CompliancePage,
});

const complianceTypes = [
  "GSTR-1","GSTR-3B","GSTR-9","TDS Deposit",
  "TDS Return Q1","TDS Return Q2","TDS Return Q3","TDS Return Q4",
  "Advance Tax","ITR Filing","Tax Audit","PF Deposit","ESI Deposit",
  "AOC-4","MGT-7","ADT-1","DIR-3 KYC","Form 11 LLP","Form 8 LLP","Other",
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
  const months11 = Array.from({length:12},(_,i)=>new Date(now.getFullYear(),now.getMonth()+i,11));
  const months20 = Array.from({length:12},(_,i)=>new Date(now.getFullYear(),now.getMonth()+i,20));
  const months7  = Array.from({length:12},(_,i)=>new Date(now.getFullYear(),now.getMonth()+i,7));
  const months15 = Array.from({length:12},(_,i)=>new Date(now.getFullYear(),now.getMonth()+i,15));

  const pick = (dates: Date[]) => (getNextFutureDateForPatterns(dates, now) ?? dates[0]).toISOString().slice(0,10);

  switch(type){
    case "GSTR-1": return pick(months11);
    case "GSTR-3B": return pick(months20);
    case "GSTR-9": return pick([new Date(now.getFullYear(),11,31),new Date(now.getFullYear()+1,11,31)]);
    case "TDS Deposit": return pick(months7);
    case "TDS Return Q1": return pick([new Date(now.getFullYear(),6,31),new Date(now.getFullYear()+1,6,31)]);
    case "TDS Return Q2": return pick([new Date(now.getFullYear(),9,31),new Date(now.getFullYear()+1,9,31)]);
    case "TDS Return Q3": return pick([new Date(now.getFullYear()+1,0,31),new Date(now.getFullYear()+2,0,31)]);
    case "TDS Return Q4": return pick([new Date(now.getFullYear()+1,4,31),new Date(now.getFullYear()+2,4,31)]);
    case "PF Deposit": return pick(months15);
    case "PTEC": return pick([new Date(now.getFullYear(),5,30),new Date(now.getFullYear()+1,5,30)]);
    case "Advance Tax Q1": return pick([new Date(now.getFullYear(),5,15),new Date(now.getFullYear()+1,5,15)]);
    case "Advance Tax Q2": return pick([new Date(now.getFullYear(),8,15),new Date(now.getFullYear()+1,8,15)]);
    case "Advance Tax Q3": return pick([new Date(now.getFullYear(),11,15),new Date(now.getFullYear()+1,11,15)]);
    case "Advance Tax Q4": return pick([new Date(now.getFullYear()+1,2,15),new Date(now.getFullYear()+2,2,15)]);
    default: return null;
  }
}

// ✅ Excel Export Function
async function downloadComplianceExcel(items: ComplianceItem[]) {
  const XLSX = await import("xlsx");

  const pending = items.filter(i => i.status !== "filed" && i.status !== "client_deleted");

  const rows = pending.map(item => ({
    "Client Name": (item as any).clients?.name ?? "—",
    "Client Type": (item as any).clients?.client_type ?? "—",
    "Compliance Type": item.compliance_type ?? "—",
    "Financial Year": item.financial_year ?? "—",
    "Due Date": item.due_date ? format(parseISO(item.due_date), "dd MMM yyyy") : "—",
    "Status": getStatusLabel(item),
    "Days Overdue / Left": (() => {
      if (!item.due_date) return "—";
      const diff = differenceInCalendarDays(parseISO(item.due_date), startOfDay(new Date()));
      if (diff < 0) return `${Math.abs(diff)} days overdue`;
      if (diff === 0) return "Due today";
      return `${diff} days left`;
    })(),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 25 }, { wch: 18 }, { wch: 20 },
    { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 18 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pending Compliance");

  // Overdue sheet
  const overdueRows = rows.filter(r => r["Status"] === "Overdue");
  if (overdueRows.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(overdueRows);
    ws2["!cols"] = ws["!cols"];
    XLSX.utils.book_append_sheet(wb, ws2, "Overdue Only");
  }

  XLSX.writeFile(wb, `compliance-pending-${format(new Date(), "dd-MMM-yyyy")}.xlsx`);
}

function CompliancePage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["compliance-items"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("compliance_items")
        .select("*, clients!inner(name, status, client_type)")
        .eq("user_id", userId ?? "")
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
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("user_id", userId ?? "")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Pick<Client, "id" | "name">[];
    },
  });

  const sortedItems = useMemo(() => {
    if (!items) return [];
    return [...items].sort((a, b) => {
      const aO = isPendingOverdue(a) ? 1 : 0;
      const bO = isPendingOverdue(b) ? 1 : 0;
      if (aO !== bO) return bO - aO;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [items]);

  const summary = useMemo(() => {
    const pending = sortedItems.filter(i => i.status !== "filed" && i.status !== "client_deleted");
    const today = startOfDay(new Date());
    const dueThisWeek = pending.filter(i => {
      if (!i.due_date) return false;
      const d = startOfDay(parseISO(i.due_date));
      return !isBefore(d, today) && differenceInCalendarDays(d, today) <= 7;
    }).length;
    const overdue = pending.filter(isPendingOverdue).length;
    return { totalPending: pending.length, dueThisWeek, overdue };
  }, [sortedItems]);

  const grouped = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, { compliance_name: string; due_date: string; clients: any[]; status_counts: { pending: number; filed: number; overdue: number } }>();
    items
      .filter(i => i.status !== "client_deleted" && i.status !== "filed")
      .forEach(item => {
        const name = item.compliance_name ?? item.compliance_type ?? "—";
        const due = item.due_date ?? "";
        const key = `${name}_${due}`;
        if (!map.has(key)) map.set(key, { compliance_name: name, due_date: due, clients: [], status_counts: { pending: 0, filed: 0, overdue: 0 } });
        const group = map.get(key)!;
        group.clients.push(item);
        const today = new Date();
        const d = new Date(`${due}T00:00:00`);
        if (d < today) group.status_counts.overdue++;
        else group.status_counts.pending++;
      });
    return Array.from(map.values())
      .filter(g => g.clients.filter((c: any) => c.status !== "client_deleted" && c.status !== "filed").length > 0)
      .sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });
  }, [items]);

  const toggleExpand = (key: string) => setExpanded(p => p === key ? null : key);

  const markAllFiled = async (group: (typeof grouped)[number]) => {
    const ids = group.clients.filter((c: any) => c.status !== "filed").map((c: any) => c.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("compliance_items").update({ status: "filed", filed_date: new Date().toISOString() }).in("id", ids);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["compliance-items"] });
  };

  const addMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("compliance_items").insert({ ...payload, status: "pending", filed_date: null, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compliance-items"] }); setOpen(false); },
  });

  const markFiledMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await supabase.from("compliance_items").update({ status: "filed", filed_date: new Date().toISOString() }).eq("id", id).select("id, client_id, compliance_type, due_date, user_id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updatedItem: any) => {
      qc.invalidateQueries({ queryKey: ["compliance-items"] });
      if (!updatedItem?.client_id || !updatedItem?.compliance_type) return;
      const nextDueDate = getNextComplianceDateForType(updatedItem.compliance_type, new Date(updatedItem.due_date ?? new Date()));
      if (!nextDueDate) return;
      const { data: existing } = await supabase.from("compliance_items").select("id").eq("client_id", updatedItem.client_id).eq("compliance_type", updatedItem.compliance_type).eq("due_date", nextDueDate).limit(1);
      if ((existing ?? []).length > 0) return;
      const d = new Date(nextDueDate);
      const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
      await supabase.from("compliance_items").insert({
        client_id: updatedItem.client_id,
        compliance_type: updatedItem.compliance_type,
        compliance_name: updatedItem.compliance_type,
        due_date: nextDueDate,
        financial_year: `${fyStart}-${String(fyStart + 1).slice(-2)}`,
        status: "pending",
        filed_date: null,
        user_id: updatedItem.user_id,
      });
    },
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadComplianceExcel(sortedItems);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance</h1>
          <p className="text-muted-foreground text-sm">Track statutory filing deadlines</p>
        </div>
        <div className="flex items-center gap-3">
          {/* ✅ Excel Download Button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || !items?.length}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            <Download size={16} />
            {downloading ? "Downloading..." : "Export Excel"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
          >
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <p className="text-sm text-muted-foreground">Total Pending</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-foreground">{summary.totalPending}</p>
            <ShieldCheck className="text-muted-foreground" size={20} />
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <p className="text-sm text-muted-foreground">Due This Week</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-foreground">{summary.dueThisWeek}</p>
            <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded-full">Soon</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-4">
          <p className="text-sm text-muted-foreground">Overdue</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-3xl font-bold text-red-600">{summary.overdue}</p>
            <span className="bg-red-100 text-red-800 text-xs font-semibold px-2 py-1 rounded-full">Critical</span>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {!isLoading && sortedItems.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="font-medium text-foreground">No compliance items yet.</p>
        </div>
      )}

      {!isLoading && grouped.length > 0 && (
        <div className="space-y-5">
          {grouped.map((group, index) => {
            const key = `${group.compliance_name}_${group.due_date}`;
            const groupDate = group.due_date ? new Date(`${group.due_date}T00:00:00`) : null;
            const month = groupDate ? groupDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase() : "UNDATED";
            const prevDate = index > 0 && grouped[index-1].due_date ? new Date(`${grouped[index-1].due_date}T00:00:00`) : null;
            const prevMonth = prevDate ? prevDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase() : "UNDATED";
            const diff = groupDate ? Math.ceil((groupDate.getTime() - startOfDay(new Date()).getTime()) / (1000*60*60*24)) : null;

            return (
              <div key={key}>
                {(index === 0 || month !== prevMonth) && (
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{month}</h2>
                )}
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground">{group.compliance_name}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {group.clients.filter((c: any) => c.status !== "client_deleted" && c.status !== "filed").length} clients pending
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.clients.slice(0, 2).map((c: any) => (
                          <span key={c.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{c.clients?.name ?? "—"}</span>
                        ))}
                        {group.clients.length > 2 && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">+{group.clients.length - 2} more</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${diff !== null && diff < 0 ? "text-red-600" : "text-primary"}`}>
                        {groupDate ? groupDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </p>
                      <p className={`mt-0.5 text-xs ${diff !== null && diff < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {diff === null ? "No due date" : diff < 0 ? `${Math.abs(diff)} days overdue` : diff === 0 ? "Due today!" : `Due in ${diff} days`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2 border-t border-border pt-3">
                    <button type="button" onClick={() => void markAllFiled(group)}
                      className="rounded-md bg-green-500 px-3 py-1.5 text-xs text-white hover:bg-green-600">
                      ✓ Mark All Filed
                    </button>
                    <button type="button" onClick={() => toggleExpand(key)}
                      className="rounded-md border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                      {expanded === key ? "Hide Clients ▲" : "View Clients ▼"}
                    </button>
                  </div>

                  {expanded === key && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {group.clients.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.clients?.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{item.clients?.client_type ?? ""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${item.status === "filed" ? "bg-green-100 text-green-700" : isPendingOverdue(item) ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {getStatusLabel(item)}
                            </span>
                            {item.status !== "filed" && (
                              <button type="button" onClick={() => markFiledMutation.mutate({ id: item.id })}
                                className="text-xs text-green-600 hover:underline">
                                Mark Filed
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

function ComplianceModal({ clients, onClose, onSubmit, pending }: {
  clients: Pick<Client, "id" | "name">[];
  onClose: () => void;
  onSubmit: (data: Record<string, string>) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({ client_id: "", compliance_type: "", due_date: "", financial_year: "", notes: "" });
  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Add Compliance Item</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ client_id: form.client_id, compliance_type: form.compliance_type, compliance_name: form.compliance_type, due_date: form.due_date, financial_year: form.financial_year, notes: form.notes });
          }}
          className="p-5 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Client *</label>
              <select required value={form.client_id} onChange={(e) => setForm({...form, client_id: e.target.value})} className={inputClass}>
                <option value="">Select a client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Compliance Type *</label>
              <select required value={form.compliance_type} onChange={(e) => setForm({...form, compliance_type: e.target.value})} className={inputClass}>
                <option value="">Select type</option>
                {complianceTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Due Date *</label>
              <input required type="date" value={form.due_date} onChange={(e) => setForm({...form, due_date: e.target.value})} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Financial Year</label>
              <input type="text" value={form.financial_year} onChange={(e) => setForm({...form, financial_year: e.target.value})} placeholder="2025-26" className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
            <textarea rows={3} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className={inputClass} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
