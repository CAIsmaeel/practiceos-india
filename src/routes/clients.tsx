import { supabase, type Client, getCurrentUserId } from "@/lib/supabase";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Plus, X, MoreVertical } from "lucide-react";
import { startOfDay } from "date-fns";

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Clients — Firmora" }] }),
  component: ClientsPage,
});

type FilterType = "active" | "inactive" | "archived" | "deleted";

type ServiceFlags = {
  gst_registered: boolean;
  gst_turnover_above_2cr: boolean;
  tds_applicable: boolean;
  pf_applicable: boolean;
  ptec_applicable: boolean;
  advance_tax_applicable: boolean;
};

const CLIENT_TYPES = [
  "Individual","Proprietorship","Partnership",
  "Private Limited","Public Limited","LLP","Trust","HUF",
];

const EMPTY_SERVICE_FLAGS: ServiceFlags = {
  gst_registered: false,
  gst_turnover_above_2cr: false,
  tds_applicable: false,
  pf_applicable: false,
  ptec_applicable: false,
  advance_tax_applicable: false,
};

function getServiceFlagsFromClient(client?: Partial<Client> | null): ServiceFlags {
  return {
    gst_registered: Boolean(client?.gst_registered),
    gst_turnover_above_2cr: Boolean(client?.gst_turnover_above_2cr),
    tds_applicable: Boolean(client?.tds_applicable),
    pf_applicable: Boolean(client?.pf_applicable),
    ptec_applicable: Boolean(client?.ptec_applicable),
    advance_tax_applicable: Boolean(client?.advance_tax_applicable),
  };
}

function getNewlyEnabledServices(previous: Partial<Client> | null | undefined, next: ServiceFlags): ServiceFlags {
  const prev = getServiceFlagsFromClient(previous);
  return {
    gst_registered: Boolean(next.gst_registered && !prev.gst_registered),
    gst_turnover_above_2cr: Boolean(next.gst_turnover_above_2cr && !prev.gst_turnover_above_2cr),
    tds_applicable: Boolean(next.tds_applicable && !prev.tds_applicable),
    pf_applicable: Boolean(next.pf_applicable && !prev.pf_applicable),
    ptec_applicable: Boolean(next.ptec_applicable && !prev.ptec_applicable),
    advance_tax_applicable: Boolean(next.advance_tax_applicable && !prev.advance_tax_applicable),
  };
}

function getFiscalYearLabel(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const fyStart = month >= 3 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${fyStart}-${String(fyEnd).slice(-2)}`;
}

function asISO(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getNextFutureDateForPatterns(patterns: Date[], referenceDate: Date): Date | null {
  const cutoff = startOfDay(referenceDate);
  const upcoming = patterns
    .map((date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()))
    .filter((date) => date >= cutoff)
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

async function generateComplianceForClient(clientId: string, serviceFlags: Partial<ServiceFlags>) {
  const now = new Date();
  const rawFlags = { ...EMPTY_SERVICE_FLAGS, ...serviceFlags };

  const { data: existingRows, error: existingError } = await supabase
    .from("compliance_items")
    .select("client_id, compliance_type, due_date")
    .eq("client_id", clientId);

  if (existingError) throw existingError;

  const existingSet = new Set((existingRows ?? []).map((row: any) => `${row.compliance_type}|${row.due_date}`));

  const entries: Array<{
    client_id: string;
    compliance_type: string;
    compliance_name: string;
    due_date: string;
    financial_year: string;
    status: string;
  }> = [];

  const pushIfMissing = (type: string, dueDate: Date) => {
    const dueDateKey = asISO(dueDate);
    if (!existingSet.has(`${type}|${dueDateKey}`)) {
      entries.push({
        client_id: clientId,
        compliance_type: type,
        compliance_name: type,
        due_date: dueDateKey,
        financial_year: getFiscalYearLabel(dueDate),
        status: "pending",
      });
    }
  };

  if (rawFlags.gst_registered) {
    const months11 = Array.from({ length: 13 }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() + i, 11)
    );
    pushIfMissing("GSTR-1", getNextFutureDateForPatterns(months11, now) ?? months11[0]);

    const months20 = Array.from({ length: 13 }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() + i, 20)
    );
    pushIfMissing("GSTR-3B", getNextFutureDateForPatterns(months20, now) ?? months20[0]);

    if (rawFlags.gst_turnover_above_2cr) {
      const candidates = [new Date(now.getFullYear(), 11, 31), new Date(now.getFullYear() + 1, 11, 31)];
      pushIfMissing("GSTR-9", getNextFutureDateForPatterns(candidates, now) ?? candidates[0]);
    }
  }

  if (rawFlags.tds_applicable) {
    const months7 = Array.from({ length: 13 }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() + i, 7)
    );
    pushIfMissing("TDS Deposit", getNextFutureDateForPatterns(months7, now) ?? months7[0]);

    const quarterDates = [
      { type: "TDS Return Q1", date: getNextFutureDateForPatterns([new Date(now.getFullYear(), 6, 31), new Date(now.getFullYear() + 1, 6, 31)], now) ?? new Date(now.getFullYear(), 6, 31) },
      { type: "TDS Return Q2", date: getNextFutureDateForPatterns([new Date(now.getFullYear(), 9, 31), new Date(now.getFullYear() + 1, 9, 31)], now) ?? new Date(now.getFullYear(), 9, 31) },
      { type: "TDS Return Q3", date: getNextFutureDateForPatterns([new Date(now.getFullYear() + 1, 0, 31), new Date(now.getFullYear() + 2, 0, 31)], now) ?? new Date(now.getFullYear() + 1, 0, 31) },
      { type: "TDS Return Q4", date: getNextFutureDateForPatterns([new Date(now.getFullYear() + 1, 4, 31), new Date(now.getFullYear() + 2, 4, 31)], now) ?? new Date(now.getFullYear() + 1, 4, 31) },
    ];
    for (const q of quarterDates) pushIfMissing(q.type, q.date);
  }

  if (rawFlags.pf_applicable) {
    const months15 = Array.from({ length: 13 }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() + i, 15)
    );
    pushIfMissing("PF Deposit", getNextFutureDateForPatterns(months15, now) ?? months15[0]);
  }

  if (rawFlags.ptec_applicable) {
    const nextDate = getNextFutureDateForPatterns(
      [new Date(now.getFullYear(), 5, 30), new Date(now.getFullYear() + 1, 5, 30)],
      now
    ) ?? new Date(now.getFullYear(), 5, 30);
    pushIfMissing("PTEC", nextDate);
  }

  if (rawFlags.advance_tax_applicable) {
    const quarterDates = [
      { type: "Advance Tax Q1", date: getNextFutureDateForPatterns([new Date(now.getFullYear(), 5, 15), new Date(now.getFullYear() + 1, 5, 15)], now) ?? new Date(now.getFullYear(), 5, 15) },
      { type: "Advance Tax Q2", date: getNextFutureDateForPatterns([new Date(now.getFullYear(), 8, 15), new Date(now.getFullYear() + 1, 8, 15)], now) ?? new Date(now.getFullYear(), 8, 15) },
      { type: "Advance Tax Q3", date: getNextFutureDateForPatterns([new Date(now.getFullYear(), 11, 15), new Date(now.getFullYear() + 1, 11, 15)], now) ?? new Date(now.getFullYear(), 11, 15) },
      { type: "Advance Tax Q4", date: getNextFutureDateForPatterns([new Date(now.getFullYear() + 1, 2, 15), new Date(now.getFullYear() + 2, 2, 15)], now) ?? new Date(now.getFullYear() + 1, 2, 15) },
    ];
    for (const q of quarterDates) pushIfMissing(q.type, q.date);
  }

  if (entries.length === 0) return;
  const { error } = await supabase.from("compliance_items").insert(entries);
  if (error) throw error;
}

function ClientsPage() {
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; client?: Client | null } | null>(null);
  const [filter, setFilter] = useState<FilterType>("active");
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importProgress, setImportProgress] = useState('');
  const [importDone, setImportDone] = useState('');

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients", filter],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("status", filter)
        .eq("user_id", userId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...payload, status: "active", user_id: userId })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id, payload };
    },
    onSuccess: async (result: any) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      if (result?.id) {
        await generateComplianceForClient(result.id, getServiceFlagsFromClient(result.payload));
      }
      setModalState(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<Client> }) => {
      const { data, error } = await supabase.from("clients").update(payload).eq("id", id).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: async (updatedClient: any, variables) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      const nextFlags = getServiceFlagsFromClient(variables.payload);
      const newFlags = getNewlyEnabledServices(modalState?.client ?? null, nextFlags);
      if (updatedClient?.id) {
        await generateComplianceForClient(updatedClient.id, newFlags);
      }
      setModalState(null);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const clientUpdate = await supabase
        .from("clients")
        .update({ status })
        .eq("id", id)
        .select("id, status")
        .single();
      if (clientUpdate.error) throw clientUpdate.error;
      if (status === "deleted") {
        const { error: complianceError } = await supabase
          .from("compliance_items")
          .update({ status: "client_deleted" })
          .eq("client_id", id)
          .eq("status", "pending");
        if (complianceError) throw complianceError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const filterButtons: { label: string; value: FilterType }[] = [
    { label: "All Active", value: "active" },
    { label: "Inactive", value: "inactive" },
    { label: "Archived", value: "archived" },
    { label: "Show Deleted", value: "deleted" },
  ];

  const statusDot: Record<FilterType, string> = {
    active: "bg-green-500",
    inactive: "bg-muted-foreground",
    archived: "bg-yellow-500",
    deleted: "bg-red-500",
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import('xlsx');
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (rows.length === 0) { alert('File appears empty.'); return; }
      const firstRow = rows[0] as Record<string, any>;
      const cols = Object.keys(firstRow);
      const mapping: Record<string, string> = {};
      const matchMap: Record<string, string[]> = {
        name: ['name', 'client name', 'company', 'company name', 'client'],
        firm_name: ['firm', 'firm name', 'organization'],
        email: ['email', 'mail', 'e-mail'],
        phone: ['phone', 'mobile', 'contact', 'mob'],
        whatsapp_number: ['whatsapp', 'wa', 'whatsapp number'],
        pan_number: ['pan', 'pan number', 'pan no'],
        gst_number: ['gstin', 'gst', 'gst number'],
        client_type: ['type', 'entity', 'entity type', 'client type'],
        notes: ['notes', 'note', 'remarks'],
      };
      cols.forEach(col => {
        const lower = col.toLowerCase().trim();
        Object.entries(matchMap).forEach(([field, keywords]) => {
          if (keywords.some(k => lower.includes(k)) && !mapping[field]) {
            mapping[field] = col;
          }
        });
      });
      setImportRows(rows as any[]);
      setImportMapping(mapping);
      setImportStep(2);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    setImportStep(3);
    let success = 0, skipped = 0, failed = 0;
    const typeMap: Record<string, string> = {
      'pvt ltd': 'Private Limited', 'private limited': 'Private Limited',
      'private ltd': 'Private Limited', 'llp': 'LLP',
      'partnership': 'Partnership', 'individual': 'Individual',
      'proprietorship': 'Proprietorship', 'proprietor': 'Proprietorship',
      'trust': 'Trust', 'huf': 'HUF', 'public limited': 'Public Limited',
      'public ltd': 'Public Limited',
    };
    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i] as Record<string, any>;
      setImportProgress(`Importing ${i + 1}/${importRows.length}...`);
      const name = importMapping.name ? String(row[importMapping.name] ?? '').trim() : '';
      if (!name) { skipped++; continue; }
      const rawType = importMapping.client_type ? String(row[importMapping.client_type] ?? '') : '';
      const clientType = typeMap[rawType.toLowerCase().trim()] || rawType;
      const { error } = await supabase.from('clients').insert({
        name,
        firm_name: importMapping.firm_name ? String(row[importMapping.firm_name] ?? '') : '',
        email: importMapping.email ? String(row[importMapping.email] ?? '') : '',
        phone: importMapping.phone ? String(row[importMapping.phone] ?? '') : '',
        whatsapp_number: importMapping.whatsapp_number ? String(row[importMapping.whatsapp_number] ?? '') : '',
        pan_number: importMapping.pan_number ? String(row[importMapping.pan_number] ?? '').toUpperCase() : '',
        gst_number: importMapping.gst_number ? String(row[importMapping.gst_number] ?? '').toUpperCase() : '',
        client_type: clientType,
        notes: importMapping.notes ? String(row[importMapping.notes] ?? '') : '',
        status: 'active',
      });
      if (error) { failed++; } else { success++; }
      await new Promise(r => setTimeout(r, 50));
    }
    setImportProgress('');
    setImportDone(`✅ Done! ${success} imported, ${skipped} skipped (empty name), ${failed} failed.`);
    qc.invalidateQueries({ queryKey: ['clients'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground text-sm">Manage your client list</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/client-template.xlsx"
            download
            className="inline-flex items-center gap-2 bg-muted hover:bg-muted text-foreground px-4 py-2 rounded-md text-sm font-medium border border-input"
          >
            📥 Download Template
          </a>
          <button
            onClick={() => {
              setImportOpen(true);
              setImportStep(1);
              setImportRows([]);
              setImportDone('');
              setImportProgress('');
            }}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import from Excel
          </button>
          <button
            onClick={() => setModalState({ mode: "create" })}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
          >
            <Plus size={16} /> Add Client
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setFilter(btn.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              filter === btn.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-input hover:bg-muted"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-left [&_th]:font-semibold [&_th]:uppercase [&_th]:text-xs [&_th]:tracking-wide">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Firm Name</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">PAN</th>
              <th className="px-5 py-3 font-medium">DSC Expiry</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!isLoading && clients?.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">No clients found.</td></tr>
            )}
            {clients?.map((c: any) => {
              const dscExpiry = c.dsc_expiry_date ? new Date(c.dsc_expiry_date) : null;
              const today = new Date();
              const daysLeft = dscExpiry ? Math.ceil((dscExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
              const dscColor = daysLeft === null ? "" : daysLeft <= 0 ? "text-red-600 font-semibold" : daysLeft <= 30 ? "text-amber-600 font-semibold" : "text-green-600";

              return (
                <tr key={c.id} className="hover:bg-muted">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[c.status as FilterType] ?? "bg-muted-foreground"}`} />
                      {c.name}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-foreground">{c.firm_name ?? "—"}</td>
                  <td className="px-5 py-3">
                    {c.client_type ? (
                      <span className="bg-primary/5 text-primary text-xs px-2 py-0.5 rounded-full">{c.client_type}</span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 text-foreground font-mono text-xs">{c.pan_number ?? "—"}</td>
                  <td className={`px-5 py-3 text-xs ${dscColor}`}>
                    {dscExpiry ? (
                      <span title={c.dsc_location ?? ""}>
                        {dscExpiry.toLocaleDateString("en-IN")}
                        {daysLeft !== null && daysLeft <= 30 && (
                          <span className="ml-1">
                            {daysLeft <= 0 ? "⚠️ Expired" : `⚠️ ${daysLeft}d left`}
                          </span>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 text-foreground">{c.phone ?? "—"}</td>
                  <td className="px-5 py-3">
                    <RowMenu
                      status={c.status}
                      client={c}
                      onAction={(action) => updateStatusMutation.mutate({ id: c.id, status: action })}
                      onEdit={() => setModalState({ mode: "edit", client: c })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalState && (
        <ClientModal
          mode={modalState.mode}
          initialClient={modalState.client ?? undefined}
          onClose={() => setModalState(null)}
          onSubmit={(payload) => {
            const cleaned = {
            ...payload,
            dsc_expiry_date: payload.dsc_expiry_date || null,
            dsc_location: payload.dsc_location || null,
            pan_number: payload.pan_number ? payload.pan_number.toUpperCase() : null,};
            if (modalState.mode === "edit" && modalState.client?.id) {
            updateMutation.mutate({ id: modalState.client.id, payload: cleaned });
            return;
            }
            addMutation.mutate(cleaned);
          }}
          pending={addMutation.isPending || updateMutation.isPending}
        />
      )}

      {importOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
              <h2 className="font-semibold text-foreground">Import Clients from Excel</h2>
              <button onClick={() => setImportOpen(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X size={18} />
              </button>
            </div>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border text-sm">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    importStep >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>{s}</span>
                  <span className={importStep >= s ? 'text-foreground' : 'text-muted-foreground'}>
                    {s === 1 ? 'Upload' : s === 2 ? 'Preview' : 'Import'}
                  </span>
                  {s < 3 && <span className="text-muted-foreground mx-2">→</span>}
                </div>
              ))}
            </div>
            <div className="p-5">
              {importStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Upload your Excel or CSV file. Columns will be auto-detected.</p>
                  <div className="border-2 border-dashed border-emerald-300 bg-emerald-50 rounded-lg p-8 text-center">
                    <div className="text-4xl mb-3">📊</div>
                    <p className="text-foreground font-medium mb-1">Drop your Excel or CSV file here</p>
                    <p className="text-muted-foreground text-xs mb-4">Supported: .xlsx, .xls, .csv</p>
                    <label className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-primary-foreground px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors">
                      Choose File
                      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </div>
                </div>
              )}
              {importStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Found <strong>{importRows.length} rows</strong>. Preview below.</p>
                  <div className="bg-muted rounded-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-foreground mb-2">Auto-detected columns:</p>
                    {Object.entries(importMapping).map(([field, col]) => (
                      <div key={field} className="flex gap-2">
                        <span className="text-primary w-36">{field.replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground">← "{col}"</span>
                      </div>
                    ))}
                    {!importMapping.name && <p className="text-red-500 font-medium mt-2">⚠️ Name column not detected.</p>}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setImportStep(1)} className="px-4 py-2 text-sm border border-input rounded-md text-foreground hover:bg-muted">← Back</button>
                    <button
                      onClick={handleImport}
                      disabled={!importMapping.name}
                      className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium disabled:opacity-50"
                    >
                      Import {importRows.length} Clients →
                    </button>
                  </div>
                </div>
              )}
              {importStep === 3 && (
                <div className="py-8 text-center space-y-4">
                  {importProgress && (
                    <div>
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-muted-foreground text-sm">{importProgress}</p>
                    </div>
                  )}
                  {importDone && (
                    <div>
                      <p className="text-3xl mb-3">🎉</p>
                      <p className="text-foreground font-medium">{importDone}</p>
                      <button onClick={() => { setImportOpen(false); setImportStep(1); }} className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">
                        Close & View Clients
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RowMenu({ status, client, onAction, onEdit }: {
  status: string;
  client: Client;
  onAction: (s: string) => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((p) => !p)} className="p-1 rounded hover:bg-muted text-muted-foreground">
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-card border border-border rounded-lg shadow-lg z-10 py-1">
          <button onClick={() => { onEdit(); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted">Edit</button>
          {status !== "inactive" && <button onClick={() => { onAction("inactive"); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted">Set Inactive</button>}
          {status !== "archived" && <button onClick={() => { onAction("archived"); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted">Archive</button>}
          {status !== "active" && <button onClick={() => { onAction("active"); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50">Restore</button>}
          {status !== "deleted" && <button onClick={() => { onAction("deleted"); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button>}
        </div>
      )}
    </div>
  );
}

function ClientModal({ mode, initialClient, onClose, onSubmit, pending }: {
  mode: "create" | "edit";
  initialClient?: Client | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({
    name: initialClient?.name ?? "",
    firm_name: initialClient?.firm_name ?? "",
    email: initialClient?.email ?? "",
    phone: initialClient?.phone ?? "",
    pan_number: initialClient?.pan_number ?? "",
    gst_number: initialClient?.gst_number ?? "",
    whatsapp_number: initialClient?.whatsapp_number ?? "",
    client_type: initialClient?.client_type ?? "",
    notes: initialClient?.notes ?? "",
    gst_registered: Boolean(initialClient?.gst_registered),
    gst_turnover_above_2cr: Boolean(initialClient?.gst_turnover_above_2cr),
    tds_applicable: Boolean(initialClient?.tds_applicable),
    pf_applicable: Boolean(initialClient?.pf_applicable),
    ptec_applicable: Boolean(initialClient?.ptec_applicable),
    advance_tax_applicable: Boolean(initialClient?.advance_tax_applicable),
    dsc_expiry_date: (initialClient as any)?.dsc_expiry_date ?? "",
    dsc_location: (initialClient as any)?.dsc_location ?? "",
  });

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));
  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-card";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-semibold text-foreground">{mode === "edit" ? "Edit Client" : "Add Client"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, status: initialClient?.status ?? "active" }); }}
          className="p-5 space-y-5"
        >
          {/* Basic Info */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Basic Info</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Name *</label>
                <input type="text" required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Firm Name</label>
                <input type="text" value={form.firm_name} onChange={(e) => set("firm_name", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Email</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Tax Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tax Details</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">PAN Number</label>
                <input type="text" maxLength={10} value={form.pan_number} onChange={(e) => set("pan_number", e.target.value.toUpperCase())} placeholder="ABCDE1234F" className={`${inputClass} font-mono`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">GST Number</label>
                <input type="text" maxLength={15} value={form.gst_number} onChange={(e) => set("gst_number", e.target.value.toUpperCase())} placeholder="22ABCDE1234F1Z5" className={`${inputClass} font-mono`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Client Type</label>
                <select value={form.client_type} onChange={(e) => set("client_type", e.target.value)} className={inputClass}>
                  <option value="">Select type...</option>
                  {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Services */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Services Applicable</p>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.gst_registered} onChange={(e) => set("gst_registered", e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                GST Registered
              </label>
              {form.gst_registered && (
                <div className="ml-6 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={form.gst_turnover_above_2cr} onChange={(e) => set("gst_turnover_above_2cr", e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                    Turnover above ₹2 Crore? (GSTR-9 applicable)
                  </label>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.tds_applicable} onChange={(e) => set("tds_applicable", e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                TDS Applicable
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.pf_applicable} onChange={(e) => set("pf_applicable", e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                PF Applicable
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.ptec_applicable} onChange={(e) => set("ptec_applicable", e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                PTEC Applicable
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.advance_tax_applicable} onChange={(e) => set("advance_tax_applicable", e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                Advance Tax Applicable
              </label>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact Details</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">WhatsApp Number</label>
                <input type="text" value={form.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} placeholder="Same as phone if blank" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>

          {/* DSC Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">🔐 DSC Details</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">DSC Expiry Date</label>
                <input
                  type="date"
                  value={form.dsc_expiry_date}
                  onChange={(e) => set("dsc_expiry_date", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">DSC Physical Location</label>
                <input
                  type="text"
                  value={form.dsc_location}
                  onChange={(e) => set("dsc_location", e.target.value)}
                  placeholder="e.g. Drawer 2, USB Box, Tray A Slot 3"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update Client" : "Save Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
