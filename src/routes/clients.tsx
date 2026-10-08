import { supabase, type Client, getCurrentUserId } from "@/lib/supabase";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Plus, X, MoreVertical } from "lucide-react";
import { startOfDay, format } from "date-fns";
import { useTour } from "@/components/Onboarding";

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
  itr_applicable: boolean;
};

type ClientDoc = {
  id: string;
  client_id: string;
  doc_type: string;
  doc_label: string | null;
  expiry_date: string | null;
  notes: string | null;
};

type ClientService = {
  id: string;
  client_id: string;
  service_name: string;
  frequency: 'monthly' | 'quarterly' | 'halfyearly' | 'annually';
  due_day: number;
  due_month: number | null;
  last_filed_date: string | null;
};

const DOC_TYPES = [
  'DSC', 'FSSAI License', 'Shop Act', 'Trade License',
  'IEC Code', 'Insurance', 'Drug License', 'MSME',
  'GST Registration', 'Trademark', 'Other'
];

const FREQ_LABELS: Record<ClientService['frequency'], string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  halfyearly: 'Half-Yearly',
  annually: 'Annually',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];


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
  itr_applicable: false,
};

function getServiceFlagsFromClient(client?: Partial<Client> | null): ServiceFlags {
  return {
    gst_registered: Boolean(client?.gst_registered),
    gst_turnover_above_2cr: Boolean(client?.gst_turnover_above_2cr),
    tds_applicable: Boolean(client?.tds_applicable),
    pf_applicable: Boolean(client?.pf_applicable),
    ptec_applicable: Boolean(client?.ptec_applicable),
    advance_tax_applicable: Boolean(client?.advance_tax_applicable),
    itr_applicable: Boolean((client as any)?.itr_applicable),
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
    itr_applicable: Boolean(next.itr_applicable && !prev.itr_applicable),
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

  if (rawFlags.itr_applicable) {
    // ITR due date varies by client type
    // We need client_type — passed via serviceFlags as extra field
    const clientType = (serviceFlags as any)?.client_type ?? "";
    const auditTypes = ["Private Limited", "Public Limited", "LLP", "Trust"];
    const businessTypes = ["Proprietorship", "Partnership"];

    let itrCandidates: Date[];
    if (auditTypes.includes(clientType)) {
      // Companies/LLP/Trust — audit cases — 21 Nov (extended this year), 31 Oct standard
      itrCandidates = [
        new Date(now.getFullYear(), 10, 21),  // 21 Nov current year
        new Date(now.getFullYear() + 1, 9, 31), // 31 Oct next year
      ];
    } else if (businessTypes.includes(clientType)) {
      // Proprietorship/Partnership — business income no audit — 31 Aug
      itrCandidates = [
        new Date(now.getFullYear(), 7, 31),   // 31 Aug current year
        new Date(now.getFullYear() + 1, 7, 31),
      ];
    } else {
      // Individual/HUF/Salaried — 31 July
      itrCandidates = [
        new Date(now.getFullYear(), 6, 31),   // 31 July current year
        new Date(now.getFullYear() + 1, 6, 31),
      ];
    }
    const itrDate = getNextFutureDateForPatterns(itrCandidates, now) ?? itrCandidates[0];
    pushIfMissing("ITR Filing", itrDate);
  }

  if (entries.length === 0) return;
  const { error } = await supabase.from("compliance_items").insert(entries);
  if (error) throw error;
}

function ClientsPage() {
  const qc = useQueryClient();
  const { triggerEvent } = useTour();
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; client?: Client | null } | null>(null);
  const [filter, setFilter] = useState<FilterType>("active");
  const [search, setSearch] = useState("");
  const [notesFor, setNotesFor] = useState<Client | null>(null);
  const [pageTab, setPageTab] = useState<"clients" | "expiry">(() =>
    typeof window !== "undefined" && window.location.hash === "#expiry" ? "expiry" : "clients"
  );

  useEffect(() => {
    if (window.location.hash === "#expiry") setPageTab("expiry");
  }, []);
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

  // Expiry Tracker — all active clients with any expiry field
  const { data: allActiveClients } = useQuery({
    queryKey: ["clients-expiry"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("clients")
        .select("id, name, firm_name, phone, email, dsc_expiry_date, fssai_expiry, shop_estab_expiry, trade_license_expiry, insurance_renewal, iec_expiry, drug_license_expiry, other_doc_name, other_doc_expiry")
        .eq("user_id", userId ?? "").eq("status", "active").order("name");
      return (data ?? []) as any[];
    },
    enabled: pageTab === "expiry",
  });

  const filteredClients = (clients ?? []).filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      (c as any).firm_name?.toLowerCase().includes(q) ||
      (c as any).phone?.includes(q) ||
      (c as any).pan?.toLowerCase().includes(q) ||
      (c as any).email?.toLowerCase().includes(q)
    );
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
        await generateComplianceForClient(result.id, {
          ...getServiceFlagsFromClient(result.payload),
          client_type: result.payload?.client_type ?? "",
        } as any);
      }
      triggerEvent("client_saved");
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
        await generateComplianceForClient(updatedClient.id, {
          ...newFlags,
          client_type: variables.payload?.client_type ?? (modalState?.client as any)?.client_type ?? "",
        } as any);
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
          <a href="/client-template.xlsx" download className="inline-flex items-center gap-2 bg-muted hover:bg-muted text-foreground px-4 py-2 rounded-md text-sm font-medium border border-input">
            📥 Download Template
          </a>
          <button
            onClick={() => { setImportOpen(true); setImportStep(1); setImportRows([]); setImportDone(''); setImportProgress(''); }}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium shadow-sm transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Import from Excel
          </button>
          <button onClick={() => setModalState({ mode: "create" })} className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium">
            <Plus size={16} /> Add Client
          </button>
        </div>
      </div>

      {/* Page tabs */}
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setPageTab("clients")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${pageTab === "clients" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          👥 Client List
        </button>
        <button onClick={() => setPageTab("expiry")} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${pageTab === "expiry" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
          📋 Document Expiry Tracker
        </button>
      </div>

      {pageTab === "expiry" && (
        <ExpiryTracker clients={allActiveClients ?? []} />
      )}

      {pageTab === "clients" && <><div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {filterButtons.map((btn) => (
            <button key={btn.value} onClick={() => setFilter(btn.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${filter === btn.value ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-input hover:bg-muted"}`}>
              {btn.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-xs">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, firm, phone, PAN..."
            className="w-full border border-input rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs">✕</button>
          )}
        </div>
        {search && (
          <span className="text-xs text-muted-foreground">{filteredClients.length} result{filteredClients.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60 text-muted-foreground text-left [&_th]:font-semibold [&_th]:uppercase [&_th]:text-xs [&_th]:tracking-wide">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Firm Name</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">PAN</th>
              <th className="px-5 py-3">DSC Expiry</th>
              <th className="px-5 py-3">Phone</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && filteredClients.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                {search ? `No clients match "${search}"` : "No clients found."}
              </td></tr>
            )}
            {filteredClients.map((c: any) => {
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
                  <td className="px-5 py-3">{c.client_type ? <span className="bg-primary/5 text-primary text-xs px-2 py-0.5 rounded-full">{c.client_type}</span> : "—"}</td>
                  <td className="px-5 py-3 text-foreground font-mono text-xs">{c.pan_number ?? "—"}</td>
                  <td className={`px-5 py-3 text-xs ${dscColor}`}>
                    {dscExpiry ? (
                      <span title={c.dsc_location ?? ""}>
                        {dscExpiry.toLocaleDateString("en-IN")}
                        {daysLeft !== null && daysLeft <= 30 && <span className="ml-1">{daysLeft <= 0 ? "⚠️ Expired" : `⚠️ ${daysLeft}d left`}</span>}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3 text-foreground">{c.phone ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setNotesFor(c)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-input px-2 py-1 rounded-md hover:bg-muted font-medium">
                        📝 Notes
                      </button>
                      <RowMenu status={c.status} client={c} onAction={(action) => updateStatusMutation.mutate({ id: c.id, status: action })} onEdit={() => setModalState({ mode: "edit", client: c })} />
                    </div>
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
            const nullDate = (v: any) => v || null;
            const cleaned = {
              ...payload,
              pan_number:           payload.pan_number ? payload.pan_number.toUpperCase() : null,
              dsc_expiry_date:      nullDate(payload.dsc_expiry_date),
              dsc_location:         payload.dsc_location || null,
              fssai_expiry:         nullDate(payload.fssai_expiry),
              shop_estab_expiry:    nullDate(payload.shop_estab_expiry),
              trade_license_expiry: nullDate(payload.trade_license_expiry),
              insurance_renewal:    nullDate(payload.insurance_renewal),
              iec_expiry:           nullDate(payload.iec_expiry),
              drug_license_expiry:  nullDate(payload.drug_license_expiry),
              other_doc_expiry:     nullDate(payload.other_doc_expiry),
              other_doc_name:       payload.other_doc_name || null,
            };
            if (modalState.mode === "edit" && modalState.client?.id) { updateMutation.mutate({ id: modalState.client.id, payload: cleaned }); return; }
            addMutation.mutate(cleaned);
          }}
          pending={addMutation.isPending || updateMutation.isPending}
        />
      )}

      </> } {/* end pageTab === "clients" */}

      {notesFor && <ClientNotesModal client={notesFor} onClose={() => setNotesFor(null)} />}

      {importOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
              <h2 className="font-semibold text-foreground">Import Clients from Excel</h2>
              <button onClick={() => setImportOpen(false)}><X size={18} /></button>
            </div>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border text-sm">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${importStep >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{s}</span>
                  <span className={importStep >= s ? 'text-foreground' : 'text-muted-foreground'}>{s === 1 ? 'Upload' : s === 2 ? 'Preview' : 'Import'}</span>
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
                    <button onClick={handleImport} disabled={!importMapping.name} className="flex-1 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium disabled:opacity-50">
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
                      <button onClick={() => { setImportOpen(false); setImportStep(1); }} className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90">Close & View Clients</button>
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

function RowMenu({ status, client, onAction, onEdit }: { status: string; client: Client; onAction: (s: string) => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((p) => !p)} className="p-1 rounded hover:bg-muted text-muted-foreground"><MoreVertical size={16} /></button>
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

// ─── Expiry Tracker ──────────────────────────────────────────────────────────
export const EXPIRY_FIELDS = [
  { key: "dsc_expiry_date",      label: "DSC",                 icon: "🔐" },
  { key: "fssai_expiry",         label: "FSSAI License",        icon: "🍽️" },
  { key: "shop_estab_expiry",    label: "Shop & Establishment", icon: "🏪" },
  { key: "trade_license_expiry", label: "Trade License",        icon: "📜" },
  { key: "insurance_renewal",    label: "Insurance Policy",     icon: "🛡️" },
  { key: "iec_expiry",           label: "IEC (Import Export)",  icon: "🌐" },
  { key: "drug_license_expiry",  label: "Drug License",         icon: "💊" },
];

function getExpiryBadge(days: number) {
  if (days < 0)   return "bg-red-100 text-red-700 border-red-300";
  if (days <= 7)  return "bg-red-100 text-red-600 border-red-300";
  if (days <= 30) return "bg-amber-100 text-amber-700 border-amber-300";
  if (days <= 90) return "bg-yellow-100 text-yellow-700 border-yellow-300";
  return "bg-green-100 text-green-700 border-green-300";
}

function getExpiryLabel(days: number) {
  if (days < 0)   return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today!";
  return `${days}d left`;
}

const ALL_EXPIRY_FIELDS = [
  ...EXPIRY_FIELDS,
  { key: "other_doc_expiry", label: "Other Document", icon: "📄" },
];

function ExpiryTracker({ clients }: { clients: any[] }) {
  const today = new Date();
  const qc = useQueryClient();
  const [showRenewed, setShowRenewed] = useState(false);

  const { data: renewals } = useQuery({
    queryKey: ["document-renewals"],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data } = await supabase.from("document_renewals")
        .select("id, client_id, field_key, expiry_date, renewed_at")
        .eq("user_id", userId ?? "");
      return data ?? [];
    },
  });

  const { data: firmSettings } = useQuery({
    queryKey: ["firm-settings-expiry"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("firm_name, email_provider, email_custom_url").limit(1).maybeSingle();
      return data as { firm_name: string; email_provider: string; email_custom_url: string } | null;
    },
  });
  const firmName = firmSettings?.firm_name ?? "CA Firm";
  const emailProvider = firmSettings?.email_provider ?? "default";
  const emailCustomUrl = firmSettings?.email_custom_url ?? "";

  // Flat entries sorted by daysLeft
  const allEntries = clients.flatMap(c =>
    ALL_EXPIRY_FIELDS.flatMap(f => {
      const val = c[f.key];
      if (!val) return [];
      const expiry = new Date(val);
      const daysLeft = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const label = f.key === "other_doc_expiry" ? (c.other_doc_name ?? "Other Document") : f.label;
      return [{ clientId: c.id, clientName: c.name, firmName: c.firm_name, phone: c.phone, email: c.email, field: { ...f, label }, expiry, expiryRaw: String(val).slice(0, 10), daysLeft }];
    })
  ).sort((a, b) => a.daysLeft - b.daysLeft);

  // Renewed docs (marked by CA) — hidden from timeline, shown in "Renewed" section with Undo
  const renewalKey = (clientId: string, fieldKey: string, date: string) => `${clientId}|${fieldKey}|${date}`;
  const renewalMap = new Map((renewals ?? []).map((r: any) => [renewalKey(r.client_id, r.field_key, String(r.expiry_date).slice(0, 10)), r]));
  const renewedEntries = allEntries
    .filter(e => renewalMap.has(renewalKey(e.clientId, e.field.key, e.expiryRaw)))
    .map(e => ({ ...e, renewal: renewalMap.get(renewalKey(e.clientId, e.field.key, e.expiryRaw)) as any }));
  const activeEntries = allEntries.filter(e => !renewalMap.has(renewalKey(e.clientId, e.field.key, e.expiryRaw)));

  const expiredEntries  = activeEntries.filter(e => e.daysLeft < 0);
  const due7Entries     = activeEntries.filter(e => e.daysLeft >= 0 && e.daysLeft <= 7);
  const due30Entries    = activeEntries.filter(e => e.daysLeft > 7 && e.daysLeft <= 30);
  const due90Entries    = activeEntries.filter(e => e.daysLeft > 30 && e.daysLeft <= 90);
  const okEntries       = activeEntries.filter(e => e.daysLeft > 90);

  const TIMELINE_GROUPS = [
    { label: "🔴 Expired",         entries: expiredEntries,  headerClass: "bg-red-50 border-red-300 text-red-700" },
    { label: "🚨 Due in 7 days",   entries: due7Entries,     headerClass: "bg-red-50 border-red-200 text-red-600" },
    { label: "🟠 Due in 30 days",  entries: due30Entries,    headerClass: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "🟡 Due in 90 days",  entries: due90Entries,    headerClass: "bg-yellow-50 border-yellow-200 text-yellow-700" },
    { label: "✅ All Good",         entries: okEntries,       headerClass: "bg-green-50 border-green-200 text-green-700" },
  ].filter(g => g.entries.length > 0);

  const renewDoc = async (e: any) => {
    const userId = await getCurrentUserId();
    const { error } = await supabase.from("document_renewals").insert({
      user_id: userId, client_id: e.clientId, field_key: e.field.key, expiry_date: e.expiryRaw,
    });
    if (error) { alert("Could not mark renewed: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["document-renewals"] });
  };

  const undoRenew = async (renewalId: string) => {
    const { error } = await supabase.from("document_renewals").delete().eq("id", renewalId);
    if (error) { alert("Could not undo: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["document-renewals"] });
  };

  // e = flat entry with clientName, phone, email, field, expiry, daysLeft
  const buildMsg = (e: any) =>
    `Dear ${e.clientName},\n\nYour ${e.field.label} is ${e.daysLeft < 0 ? `expired ${Math.abs(e.daysLeft)} days ago` : `expiring in ${e.daysLeft} days`} (${format(e.expiry, "dd MMM yyyy")}).\n\nPlease arrange for renewal at the earliest.\n\nThank you,\n${firmName}`;

  const sendWA = (e: any, _d?: any) => {
    const entry = _d ? { ...e, ...{ clientName: e.clientName ?? e.name, field: _d.field, expiry: _d.expiry, daysLeft: _d.daysLeft } } : e;
    const phone = (e.phone ?? "").replace(/\D/g, "");
    const msg = encodeURIComponent(buildMsg(entry));
    window.open(phone ? `https://wa.me/91${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank");
  };

  const sendEmail = (e: any, _d?: any) => {
    const email = e.email ?? "";
    if (!email) { alert("Client ka email nahi mila."); return; }
    const entry = _d ? { ...e, ...{ clientName: e.clientName ?? e.name, field: _d.field, expiry: _d.expiry, daysLeft: _d.daysLeft } } : e;
    const subject = encodeURIComponent(`Document Renewal Reminder — ${entry.field.label}`);
    const body = encodeURIComponent(buildMsg(entry));
    const to = encodeURIComponent(email);
    let url = "";
    switch (emailProvider) {
      case "gmail":   url = `https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`; break;
      case "outlook": url = `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${subject}&body=${body}`; break;
      case "zoho":    url = `https://mail.zoho.in/zm/#compose?to=${to}&subject=${subject}&body=${body}`; break;
      case "custom":  url = emailCustomUrl ? `${emailCustomUrl.replace(/\/$/, "")}?to=${to}&subject=${subject}&body=${body}` : `mailto:${email}?subject=${subject}&body=${body}`; break;
      default:        url = `mailto:${email}?subject=${subject}&body=${body}`;
    }
    window.open(url, "_blank");
  };

  if (clients.length === 0) return <div className="text-center py-16 text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", val: activeEntries.length, cls: "bg-card border-border text-foreground" },
          { label: "🔴 Expired", val: expiredEntries.length, cls: "bg-red-50 border-red-200 text-red-700" },
          { label: "🚨 Due in 7d", val: due7Entries.length, cls: "bg-red-50 border-red-100 text-red-600" },
          { label: "🟠 Due in 30d", val: due30Entries.length, cls: "bg-amber-50 border-amber-200 text-amber-700" },
          { label: "🟡 Due in 90d", val: due90Entries.length, cls: "bg-yellow-50 border-yellow-200 text-yellow-700" },
        ].map(s => (
          <div key={s.label} className={`border rounded-lg p-3 shadow-sm ${s.cls}`}>
            <p className="text-[11px] font-medium">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.val}</p>
          </div>
        ))}
      </div>

      {allEntries.length === 0 && (
        <div className="text-center py-12 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">No expiry dates tracked yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Edit a client and add DSC, FSSAI, Shop License expiry dates.</p>
        </div>
      )}

      {/* Timeline sections */}
      {TIMELINE_GROUPS.map(group => (
        <div key={group.label} className="rounded-lg border border-border shadow-sm overflow-hidden">
          <div className={`px-4 py-2.5 border-b border-border font-semibold text-sm ${group.headerClass}`}>
            {group.label} — {group.entries.length} document{group.entries.length !== 1 ? "s" : ""}
          </div>
          <div className="divide-y divide-border">
            {group.entries.map((e, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 bg-card hover:bg-muted/40">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-lg shrink-0">{e.field.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{e.field.label}</p>
                      <span className="text-xs text-muted-foreground">·</span>
                      <p className="text-sm text-muted-foreground">{e.clientName}</p>
                      {e.firmName && <span className="text-xs text-muted-foreground">({e.firmName})</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{format(e.expiry, "dd MMM yyyy")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${getExpiryBadge(e.daysLeft)}`}>
                    {getExpiryLabel(e.daysLeft)}
                  </span>
                  <button onClick={() => renewDoc(e)}
                    className="text-xs text-purple-700 border border-purple-200 px-2 py-1 rounded-md hover:bg-purple-50 font-medium">
                    ✓ Mark Renewed
                  </button>
                  {e.phone && (
                    <button onClick={() => sendWA(e, { field: e.field, expiry: e.expiry, daysLeft: e.daysLeft })}
                      className="text-xs text-green-700 border border-green-200 px-2 py-1 rounded-md hover:bg-green-50 font-medium">
                      💬 WA
                    </button>
                  )}
                  {e.email && (
                    <button onClick={() => sendEmail(e, { field: e.field, expiry: e.expiry, daysLeft: e.daysLeft })}
                      className="text-xs text-blue-700 border border-blue-200 px-2 py-1 rounded-md hover:bg-blue-50 font-medium">
                      ✉️ Email
                    </button>
                  )}
                </div>
              </div>
            ))}

          </div>
        </div>
      ))}

      {/* Renewed documents — with Undo */}
      {renewedEntries.length > 0 && (
        <div className="rounded-lg border border-purple-200 shadow-sm overflow-hidden">
          <button type="button" onClick={() => setShowRenewed(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-purple-50 text-purple-700 font-semibold text-sm">
            <span>🔄 Renewed — {renewedEntries.length} document{renewedEntries.length !== 1 ? "s" : ""}</span>
            <span className="text-xs">{showRenewed ? "Hide ▲" : "Show ▼"}</span>
          </button>
          {showRenewed && (
            <div className="divide-y divide-border">
              {renewedEntries.map((e, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 bg-card">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{e.field.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{e.field.label} <span className="font-normal text-muted-foreground">· {e.clientName}</span></p>
                      <p className="text-xs text-muted-foreground">Expiry {format(e.expiry, "dd MMM yyyy")} · Marked renewed {format(new Date(e.renewal.renewed_at), "dd MMM yyyy")}</p>
                    </div>
                  </div>
                  <button onClick={() => undoRenew(e.renewal.id)}
                    className="text-xs text-muted-foreground border border-input px-2 py-1 rounded-md hover:bg-muted font-medium shrink-0">
                    ↩ Undo
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="px-4 py-2 text-[11px] text-muted-foreground bg-purple-50/40 border-t border-purple-100">
            Tip: Update the new expiry date in the client's profile (Edit Client) so the next renewal is tracked.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Client Notes Modal ───────────────────────────────────────────────────────
function ClientNotesModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const qc = useQueryClient();
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: notes, isLoading } = useQuery({
    queryKey: ["client-notes", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("client_notes")
        .select("id, note, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const addNote = async () => {
    const txt = newNote.trim();
    if (!txt) return;
    setSaving(true);
    const userId = await getCurrentUserId();
    await supabase.from("client_notes").insert({ user_id: userId, client_id: client.id, note: txt });
    setNewNote("");
    qc.invalidateQueries({ queryKey: ["client-notes", client.id] });
    setSaving(false);
  };

  const deleteNote = async (id: string) => {
    await supabase.from("client_notes").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["client-notes", client.id] });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-foreground">📝 Internal Notes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{client.name} — visible only to your team</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {isLoading && <p className="px-5 py-6 text-sm text-muted-foreground text-center">Loading...</p>}
          {!isLoading && (notes ?? []).length === 0 && (
            <p className="px-5 py-8 text-sm text-muted-foreground text-center">No notes yet. Add one below.</p>
          )}
          {(notes ?? []).map((n: any) => (
            <div key={n.id} className="px-5 py-3 flex items-start gap-3 hover:bg-muted/30">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-relaxed">{n.note}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {format(new Date(n.created_at), "dd MMM yyyy, h:mm a")}
                </p>
              </div>
              <button onClick={() => deleteNote(n.id)} className="text-muted-foreground hover:text-red-500 shrink-0 mt-0.5">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Add note */}
        <div className="px-5 py-4 border-t border-border space-y-2">
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) addNote(); }}
            placeholder="Add a note... (Ctrl+Enter to save)"
            rows={3}
            className="w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background resize-none"
          />
          <button
            onClick={addNote}
            disabled={saving || !newNote.trim()}
            className="w-full px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 font-medium"
          >
            {saving ? "Saving..." : "Add Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
function ClientDocumentsSection({ clientId, userId }: { clientId: string; userId: string }) {
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ doc_type: 'DSC', doc_label: '', expiry_date: '', notes: '' });

  const load = async () => {
    const { data } = await supabase
      .from('client_documents')
      .select('*')
      .eq('client_id', clientId)
      .order('expiry_date', { ascending: true, nullsFirst: false });
    if (data) setDocs(data);
  };

  useEffect(() => { load(); }, [clientId]);

  const openAdd = () => {
    setForm({ doc_type: 'DSC', doc_label: '', expiry_date: '', notes: '' });
    setEditId(null);
    setShowAdd(true);
  };

  const openEdit = (doc: ClientDoc) => {
    setForm({
      doc_type: doc.doc_type,
      doc_label: doc.doc_label || '',
      expiry_date: doc.expiry_date || '',
      notes: doc.notes || '',
    });
    setEditId(doc.id);
    setShowAdd(true);
  };

  const save = async () => {
    if (!form.doc_type) return;
    const payload = {
      doc_type: form.doc_type,
      doc_label: form.doc_label || null,
      expiry_date: form.expiry_date || null,
      notes: form.notes || null,
    };
    if (editId) {
      await supabase.from('client_documents').update(payload).eq('id', editId);
    } else {
      await supabase.from('client_documents').insert({ ...payload, user_id: userId, client_id: clientId });
    }
    setShowAdd(false);
    setEditId(null);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('client_documents').delete().eq('id', id);
    load();
  };

  const expiryStatus = (date: string | null) => {
    if (!date) return null;
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: `Expired ${Math.abs(days)}d ago`, cls: 'bg-red-50 text-red-700' };
    if (days <= 30) return { label: `${days}d left`, cls: 'bg-amber-50 text-amber-700' };
    if (days <= 90) return { label: `${days}d left`, cls: 'bg-yellow-50 text-yellow-700' };
    return { label: `${days}d left`, cls: 'bg-green-50 text-green-700' };
  };

  return (
    <div className="space-y-3">
      {docs.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 text-center py-6">No documents added yet</p>
      )}

      {docs.map(doc => {
        const s = expiryStatus(doc.expiry_date);
        return (
          <div key={doc.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{doc.doc_type}</span>
                {doc.doc_label && <span className="text-xs text-gray-500">({doc.doc_label})</span>}
                {s && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>}
              </div>
              {doc.expiry_date && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Expires: {new Date(doc.expiry_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
              {doc.notes && <p className="text-xs text-gray-400 mt-0.5">{doc.notes}</p>}
            </div>
            <div className="flex gap-3 ml-3 flex-shrink-0">
              <button onClick={() => openEdit(doc)} className="text-xs text-blue-600 hover:underline">Edit</button>
              <button onClick={() => remove(doc.id)} className="text-xs text-red-500 hover:underline">Delete</button>
            </div>
          </div>
        );
      })}

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">{editId ? 'Edit Document' : 'Add Document'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Type *</label>
              <select
                value={form.doc_type}
                onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
              >
                {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Label (optional)</label>
              <input
                value={form.doc_label}
                onChange={e => setForm(f => ({ ...f, doc_label: e.target.value }))}
                placeholder="e.g. Director DSC, Branch 2"
                className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Expiry Date</label>
            <input
              type="date"
              autoComplete="off"
              value={form.expiry_date}
              onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))}
              className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Notes (optional)</label>
            <input
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Class 3, kept with CA"
              className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
              {editId ? 'Update' : 'Save'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setEditId(null); }}
              className="px-4 py-1.5 border rounded-md text-sm hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showAdd && (
        <button
          onClick={openAdd}
          className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add Document
        </button>
      )}
    </div>
  );
}

// ─── Client Recurring Services (custom compliance) ───────────────────────────
function getServiceNextDue(s: ClientService, ref: Date = new Date()): Date {
  const today = startOfDay(ref);
  const y = today.getFullYear();
  const safeDay = (yr: number, m: number) => Math.min(s.due_day, new Date(yr, m + 1, 0).getDate());
  const mk = (yr: number, m: number) => new Date(yr, m, safeDay(yr, m));

  if (s.frequency === "monthly") {
    const m = today.getMonth();
    const d = mk(y, m);
    if (d >= today) return d;
    return m === 11 ? mk(y + 1, 0) : mk(y, m + 1);
  }
  if (s.frequency === "quarterly") {
    // Due in the month after each quarter ends: Jul, Oct, Jan, Apr
    const cands = [mk(y, 0), mk(y, 3), mk(y, 6), mk(y, 9), mk(y + 1, 0)];
    return cands.find(d => d >= today)!;
  }
  if (s.frequency === "halfyearly") {
    // Due in the month after each half-year ends: Oct and Apr
    const cands = [mk(y, 3), mk(y, 9), mk(y + 1, 3)];
    return cands.find(d => d >= today)!;
  }
  const m = (s.due_month ?? 1) - 1;
  const d = mk(y, m);
  return d >= today ? d : mk(y + 1, m);
}

function ClientServicesSection({ clientId, userId }: { clientId: string; userId: string }) {
  const [services, setServices] = useState<ClientService[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emptyForm = { service_name: '', frequency: 'monthly' as ClientService['frequency'], due_day: '20', due_month: '' };
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    const { data, error } = await supabase
      .from('client_services')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });
    if (error) setError(error.message);
    if (data) setServices(data as ClientService[]);
  };

  useEffect(() => { load(); }, [clientId]);

  const openAdd = () => { setForm(emptyForm); setEditId(null); setError(null); setShowAdd(true); };

  const openEdit = (s: ClientService) => {
    setForm({
      service_name: s.service_name,
      frequency: s.frequency,
      due_day: String(s.due_day),
      due_month: s.due_month ? String(s.due_month) : '',
    });
    setEditId(s.id);
    setError(null);
    setShowAdd(true);
  };

  const save = async () => {
    if (!form.service_name.trim()) { setError('Service name is required'); return; }
    const day = parseInt(form.due_day, 10);
    if (!day || day < 1 || day > 31) { setError('Due day must be between 1 and 31'); return; }
    if (form.frequency === 'annually' && !form.due_month) { setError('Select the due month for an annual service'); return; }
    const payload = {
      service_name: form.service_name.trim(),
      frequency: form.frequency,
      due_day: day,
      due_month: form.frequency === 'annually' ? parseInt(form.due_month, 10) : null,
    };
    const res = editId
      ? await supabase.from('client_services').update(payload).eq('id', editId)
      : await supabase.from('client_services').insert({ ...payload, user_id: userId, client_id: clientId });
    if (res.error) { setError(res.error.message); return; }
    setShowAdd(false);
    setEditId(null);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('client_services').delete().eq('id', id);
    load();
  };

  const freqCls: Record<ClientService['frequency'], string> = {
    monthly: 'bg-blue-50 text-blue-700',
    quarterly: 'bg-purple-50 text-purple-700',
    halfyearly: 'bg-teal-50 text-teal-700',
    annually: 'bg-orange-50 text-orange-700',
  };

  const scheduleText = (s: ClientService) => {
    if (s.frequency === 'monthly') return `Every month on ${s.due_day}`;
    if (s.frequency === 'quarterly') return `${s.due_day} Jan / Apr / Jul / Oct`;
    if (s.frequency === 'halfyearly') return `${s.due_day} Apr / Oct`;
    return `Every year on ${s.due_day} ${MONTHS[(s.due_month ?? 1) - 1]}`;
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Add any service this client takes from you. Set the due date once — it repeats automatically and shows in Compliance.
      </p>

      {services.length === 0 && !showAdd && (
        <p className="text-sm text-gray-400 text-center py-6">No recurring services added yet</p>
      )}

      {services.map(s => {
        const next = getServiceNextDue(s);
        const days = Math.round((next.getTime() - startOfDay(new Date()).getTime()) / 86400000);
        return (
          <div key={s.id} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{s.service_name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${freqCls[s.frequency]}`}>{FREQ_LABELS[s.frequency]}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{scheduleText(s)}</p>
              <p className={`text-xs mt-0.5 ${days <= 7 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                Next due: {format(next, 'dd MMM yyyy')} {days === 0 ? '(today)' : `(${days}d)`}
              </p>
            </div>
            <div className="flex gap-3 ml-3 flex-shrink-0">
              <button type="button" onClick={() => openEdit(s)} className="text-xs text-blue-600 hover:underline">Edit</button>
              <button type="button" onClick={() => remove(s.id)} className="text-xs text-red-500 hover:underline">Delete</button>
            </div>
          </div>
        );
      })}

      {showAdd && (
        <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
          <p className="text-sm font-semibold text-gray-700">{editId ? 'Edit Service' : 'Add Service'}</p>
          <div>
            <label className="text-xs font-medium text-gray-600">Service Name *</label>
            <input
              value={form.service_name}
              onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))}
              placeholder="e.g. Bookkeeping, MIS Report, Stock Statement to Bank"
              className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Frequency *</label>
              <select
                value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value as ClientService['frequency'] }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
              >
                {(Object.keys(FREQ_LABELS) as ClientService['frequency'][]).map(k => (
                  <option key={k} value={k}>{FREQ_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Due Day *</label>
              <input
                type="number" min={1} max={31}
                value={form.due_day}
                onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
              />
            </div>
          </div>
          {form.frequency === 'annually' && (
            <div>
              <label className="text-xs font-medium text-gray-600">Due Month *</label>
              <select
                value={form.due_month}
                onChange={e => setForm(f => ({ ...f, due_month: e.target.value }))}
                className="w-full border rounded-md px-3 py-1.5 text-sm mt-1"
              >
                <option value="">Select month...</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
              {editId ? 'Update' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setEditId(null); setError(null); }}
              className="px-4 py-1.5 border rounded-md text-sm hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!showAdd && (
        <button
          type="button"
          onClick={openAdd}
          className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add Service
        </button>
      )}
    </div>
  );
}


function ClientModal({ mode, initialClient, onClose, onSubmit, pending }: {
  mode: "create" | "edit"; initialClient?: Client | null;
  onClose: () => void; onSubmit: (data: any) => void; pending: boolean;
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
    itr_applicable: Boolean((initialClient as any)?.itr_applicable),
    dsc_expiry_date:      (initialClient as any)?.dsc_expiry_date      ?? "",
    dsc_location:         (initialClient as any)?.dsc_location          ?? "",
    fssai_expiry:         (initialClient as any)?.fssai_expiry          ?? "",
    shop_estab_expiry:    (initialClient as any)?.shop_estab_expiry     ?? "",
    trade_license_expiry: (initialClient as any)?.trade_license_expiry  ?? "",
    insurance_renewal:    (initialClient as any)?.insurance_renewal     ?? "",
    iec_expiry:           (initialClient as any)?.iec_expiry            ?? "",
    drug_license_expiry:  (initialClient as any)?.drug_license_expiry   ?? "",
    other_doc_name:       (initialClient as any)?.other_doc_name        ?? "",
    other_doc_expiry:     (initialClient as any)?.other_doc_expiry      ?? "",
  });

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));
  const [formTab, setFormTab] = useState<"info" | "docs" | "services">("info");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => { getCurrentUserId().then((id: any) => setCurrentUserId(id ?? null)); }, []);
  const canUseExtraTabs = mode === "edit" && Boolean(initialClient?.id);
  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-card";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-semibold text-foreground">{mode === "edit" ? "Edit Client" : "Add Client"}</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tabs: Info / Documents / Services */}
        <div className="flex border-b border-border px-5 bg-card">
          {([
            { key: "info", label: "📋 Info" },
            { key: "docs", label: "📂 Documents" },
            { key: "services", label: "🔁 Services" },
          ] as const).map(t => {
            const disabled = t.key !== "info" && !canUseExtraTabs;
            return (
              <button
                key={t.key}
                type="button"
                disabled={disabled}
                title={disabled ? "Save the client first, then open Edit to add this" : ""}
                onClick={() => setFormTab(t.key)}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  formTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {formTab === "docs" && canUseExtraTabs && (
          <div className="p-5">
            {currentUserId
              ? <ClientDocumentsSection clientId={initialClient!.id} userId={currentUserId} />
              : <p className="text-sm text-muted-foreground">Loading…</p>}
          </div>
        )}

        {formTab === "services" && canUseExtraTabs && (
          <div className="p-5">
            {currentUserId
              ? <ClientServicesSection clientId={initialClient!.id} userId={currentUserId} />
              : <p className="text-sm text-muted-foreground">Loading…</p>}
          </div>
        )}

        {formTab === "info" && mode === "create" && (
          <p className="mx-5 mt-4 text-xs rounded-md border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2">
            💡 Save the client first. Then click Edit to add multiple documents and recurring services.
          </p>
        )}

        {formTab === "info" && (
        <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, status: initialClient?.status ?? "active" }); }} className="p-5 space-y-5">

          {/* Basic Info */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Basic Info</p>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Name *</label>
                <input type="text" required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Firm Name</label>
                <input type="text" value={form.firm_name} onChange={(e) => set("firm_name", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Email</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Phone</label>
                <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} /></div>
            </div>
          </div>

          {/* Tax Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tax Details</p>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">PAN Number</label>
                <input type="text" maxLength={10} value={form.pan_number} onChange={(e) => set("pan_number", e.target.value.toUpperCase())} placeholder="ABCDE1234F" className={`${inputClass} font-mono`} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">GST Number</label>
                <input type="text" maxLength={15} value={form.gst_number} onChange={(e) => set("gst_number", e.target.value.toUpperCase())} placeholder="22ABCDE1234F1Z5" className={`${inputClass} font-mono`} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Client Type</label>
                <select value={form.client_type} onChange={(e) => set("client_type", e.target.value)} className={inputClass}>
                  <option value="">Select type...</option>
                  {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></div>
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
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={form.itr_applicable} onChange={(e) => set("itr_applicable", e.target.checked)} className="h-4 w-4 rounded border-input text-primary" />
                ITR Filing Applicable
              </label>
            </div>
          </div>

          {/* Contact Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contact Details</p>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">WhatsApp Number</label>
                <input type="text" value={form.whatsapp_number} onChange={(e) => set("whatsapp_number", e.target.value)} placeholder="Same as phone if blank" className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={`${inputClass} resize-none`} /></div>
            </div>
          </div>

          {/* DSC Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">🔐 DSC Details</p>
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">DSC Expiry Date</label>
                <input type="date" value={form.dsc_expiry_date} onChange={(e) => set("dsc_expiry_date", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">DSC Physical Location</label>
                <input type="text" value={form.dsc_location} onChange={(e) => set("dsc_location", e.target.value)} placeholder="e.g. Drawer 2, USB Box, Tray A Slot 3" className={inputClass} /></div>
            </div>
          </div>

          {/* Document Expiry Tracker */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">📋 Document Expiry Tracker</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">🍽️ FSSAI License Expiry</label>
                <input type="date" value={form.fssai_expiry} onChange={e => set("fssai_expiry", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">🏪 Shop & Establishment Expiry</label>
                <input type="date" value={form.shop_estab_expiry} onChange={e => set("shop_estab_expiry", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">📜 Trade License Expiry</label>
                <input type="date" value={form.trade_license_expiry} onChange={e => set("trade_license_expiry", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">🛡️ Insurance Policy Renewal</label>
                <input type="date" value={form.insurance_renewal} onChange={e => set("insurance_renewal", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">🌐 IEC (Import Export Code) Expiry</label>
                <input type="date" value={form.iec_expiry} onChange={e => set("iec_expiry", e.target.value)} className={inputClass} /></div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">💊 Drug License Expiry</label>
                <input type="date" value={form.drug_license_expiry} onChange={e => set("drug_license_expiry", e.target.value)} className={inputClass} /></div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">📄 Other Document Name</label>
                <input type="text" value={form.other_doc_name} onChange={e => set("other_doc_name", e.target.value)} placeholder="e.g. RERA Certificate, Drug License, PCB Consent..." className={inputClass} />
              </div>
              <div><label className="block text-xs font-medium text-muted-foreground mb-1">📄 Other Document Expiry</label>
                <input type="date" value={form.other_doc_expiry} onChange={e => set("other_doc_expiry", e.target.value)} className={inputClass} /></div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
            <button type="submit" disabled={pending} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {pending ? "Saving..." : mode === "edit" ? "Update Client" : "Save Client"}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
