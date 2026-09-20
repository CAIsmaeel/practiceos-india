import { supabase, type Client, getCurrentUserId } from "@/lib/supabase";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Plus, X, MoreVertical } from "lucide-react";
import { startOfDay } from "date-fns";


export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Clients — PracticeOS" }] }),
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
    inactive: "bg-gray-400",
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
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm">Manage your client list</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setImportOpen(true);
              setImportStep(1);
              setImportRows([]);
              setImportDone('');
              setImportProgress('');
            }}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors"
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
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
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
                ? "bg-blue-500 text-white border-blue-500"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Firm Name</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">PAN</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {!isLoading && clients?.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No clients found.</td></tr>
            )}
            {clients?.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[c.status as FilterType] ?? "bg-gray-400"}`} />
                    {c.name}
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-700">{c.firm_name ?? "—"}</td>
                <td className="px-5 py-3">
                  {c.client_type ? (
                    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{c.client_type}</span>
                  ) : "—"}
                </td>
                <td className="px-5 py-3 text-slate-700 font-mono text-xs">{c.pan_number ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{c.phone ?? "—"}</td>
                <td className="px-5 py-3">
                  <RowMenu
                    status={c.status}
                    client={c}
                    onAction={(action) => updateStatusMutation.mutate({ id: c.id, status: action })}
                    onEdit={() => setModalState({ mode: "edit", client: c })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalState && (
        <ClientModal
          mode={modalState.mode}
          initialClient={modalState.client ?? undefined}
          onClose={() => setModalState(null)}
          onSubmit={(payload) => {
            if (modalState.mode === "edit" && modalState.client?.id) {
              updateMutation.mutate({ id: modalState.client.id, payload });
              return;
            }
            addMutation.mutate(payload);
          }}
          pending={addMutation.isPending || updateMutation.isPending}
        />
      )}

      {importOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h2 className="font-semibold text-slate-900">Import Clients from Excel</h2>
              <button onClick={() => setImportOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 text-sm">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    importStep >= s ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>{s}</span>
                  <span className={importStep >= s ? 'text-slate-900' : 'text-slate-400'}>
                    {s === 1 ? 'Upload' : s === 2 ? 'Preview' : 'Import'}
                  </span>
                  {s < 3 && <span className="text-slate-300 mx-2">→</span>}
                </div>
              ))}
            </div>

            <div className="p-5">
              {importStep === 1 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Upload your Excel or CSV file. Columns will be auto-detected.
                    Supported: .xlsx, .xls, .csv
                  </p>
                  <div className="border-2 border-dashed border-emerald-300 bg-emerald-50 rounded-lg p-8 text-center">
                    <div className="text-4xl mb-3">📊</div>
                    <p className="text-slate-700 font-medium mb-1">Drop your Excel or CSV file here</p>
                    <p className="text-slate-400 text-xs mb-4">Supported: .xlsx, .xls, .csv</p>
                    <label className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      Choose File
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-400 text-center">
                    Columns supported: Name, Firm Name, Email, Phone, WhatsApp, PAN, GSTIN, Client Type, Notes
                  </p>
                </div>
              )}

              {importStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Found <strong>{importRows.length} rows</strong>. Preview below — first 5 rows shown.
                  </p>
                  <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-slate-700 mb-2">Auto-detected columns:</p>
                    {Object.entries(importMapping).map(([field, col]) => (
                      <div key={field} className="flex gap-2">
                        <span className="text-blue-600 w-36">{field.replace(/_/g, ' ')}</span>
                        <span className="text-slate-500">← "{col}"</span>
                      </div>
                    ))}
                    {!importMapping.name && (
                      <p className="text-red-500 font-medium mt-2">⚠️ Name column not detected.</p>
                    )}
                  </div>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="text-xs w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          {['name','firm_name','email','phone','pan_number','gst_number','client_type'].map(f => (
                            <th key={f} className="px-3 py-2 text-left font-medium text-slate-600">
                              {f.replace(/_/g, ' ')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 5).map((row: any, i: number) => (
                          <tr key={i} className="border-t border-slate-100">
                            {['name','firm_name','email','phone','pan_number','gst_number','client_type'].map(f => (
                              <td key={f} className="px-3 py-2 text-slate-700">
                                {importMapping[f] ? String(row[importMapping[f]] ?? '') || '—' : '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importRows.length > 5 && (
                    <p className="text-xs text-slate-400 text-center">+{importRows.length - 5} more rows not shown</p>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setImportStep(1)}
                      className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={!importMapping.name}
                      className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-slate-600 text-sm">{importProgress}</p>
                    </div>
                  )}
                  {importDone && (
                    <div>
                      <p className="text-3xl mb-3">🎉</p>
                      <p className="text-slate-800 font-medium">{importDone}</p>
                      <button
                        onClick={() => { setImportOpen(false); setImportStep(1); }}
                        className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                      >
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

function RowMenu({
  status,
  client,
  onAction,
  onEdit,
}: {
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
      <button
        onClick={() => setOpen((p) => !p)}
        className="p-1 rounded hover:bg-slate-100 text-slate-500"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1">
          <button onClick={() => { onEdit(); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Edit</button>
          {status !== "inactive" && (
            <button onClick={() => { onAction("inactive"); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Set Inactive</button>
          )}
          {status !== "archived" && (
            <button onClick={() => { onAction("archived"); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Archive</button>
          )}
          {status !== "active" && (
            <button onClick={() => { onAction("active"); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50">Restore</button>
          )}
          {status !== "deleted" && (
            <button onClick={() => { onAction("deleted"); setOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button>
          )}
        </div>
      )}
    </div>
  );
}

function ClientModal({
  mode,
  initialClient,
  onClose,
  onSubmit,
  pending,
}: {
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
  });

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));
  const inputClass = "w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="font-semibold text-slate-900">{mode === "edit" ? "Edit Client" : "Add Client"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, status: initialClient?.status ?? "active" }); }}
          className="p-5 space-y-5"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Basic Info</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Name *</label>
                <input type="text" required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Firm Name</label>
                <input type="text" value={form.firm_name} onChange={(e) => set("firm_name", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Email</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Tax Details</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">PAN Number</label>
                <input type="text" maxLength={10} value={form.pan_number} onChange={(e) => set("pan_number", e.target.value.toUpperCase())} placeholder="ABCDE1234F" className={`${inputClass} font-mono`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">GST Number</label>
                <input type="text" maxLength={15} value={form.gst_number} onChange={(e) => set("gst_number", e.target.value.toUpperCase())} placeholder="22ABCDE1234F1Z5" className={`${inputClass} font-mono`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Client Type</label>
                <select value={form.client_type} onChange={(e) => set("client_type", e.target.value)} className={inputClass}>
                  <option value="">Select type...</option>
                  {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Services Applicable</p>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.gst_registered} onChange={(e) => set("gst_registered", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                GST Registered
              </label>
              {form.gst_registered && (
                <div className="ml-6 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={form.gst_turnover_above_2cr} onChange={(e) => set("gst_turnover_above_2cr", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                    Turnover above ₹2 Crore? (GSTR-9 applicable)
                  </label>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.tds_applicable} onChange={(e) => set("tds_applicable", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                TDS Applicable
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.pf_applicable} onChange={(e) => set("pf_applicable", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                PF Applicable
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.ptec_applicable} onChange={(e) => set("ptec_applicable", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                PTEC Applicable
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.advance_tax_applicable} onChange={(e) => set("advance_tax_applicable", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                Advance Tax Applicable
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Contact Details</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">WhatsApp Number</label>
                <input type="text" value={form.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} placeholder="Same as phone if blank" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={`${inputClass} resize-none`} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update Client" : "Save Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
