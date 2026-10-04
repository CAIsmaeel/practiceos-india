import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type FirmSettings } from "@/lib/supabase";
import { useState, useEffect, useRef } from "react";
import { Upload, X, Globe, Copy, Check, Plus, Trash2 } from "lucide-react";
import { ENGAGEMENT_TYPES, getTemplate, getAllTemplate } from "@/lib/checklistTemplates";
import { useTour } from "@/components/Onboarding";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Firmora" }] }),
  component: SettingsPage,
});

const SERVICE_CATEGORIES = [
  { category: "GST & Indirect Tax", icon: "🧾", services: ["GST Registration","GSTR-1 Filing","GSTR-3B Filing","GSTR-9 Annual Return","GSTR-9C Reconciliation","GST Notice Reply","GST Refund Application","E-Invoice Compliance","LUT Filing","ITC Reconciliation"] },
  { category: "Income Tax & Direct Tax", icon: "📄", services: ["Individual ITR Filing","Business & Firm ITR","Company ITR Filing","Tax Audit (u/s 44AB)","Advance Tax Calculation","Capital Gains Tax","Income Tax Notice Reply","TDS Return Filing","Form 16 / 16A Generation","NRI Taxation"] },
  { category: "Audit & Assurance", icon: "🔍", services: ["Statutory Audit","Internal Audit","Tax Audit","Concurrent Audit","Stock Audit","Bank Audit","Trust & NGO Audit","Due Diligence Audit","Forensic Accounting"] },
  { category: "Company Law & ROC", icon: "🏢", services: ["Private Limited Company Incorporation","LLP Incorporation","OPC Incorporation","Annual ROC Filings (AOC-4 / MGT-7)","LLP Annual Filings (Form 11 / Form 8)","Director KYC (DIR-3 KYC)","Company Strike-off","Share Transfer Documentation","MOA & AOA Drafting"] },
  { category: "Accounting & Bookkeeping", icon: "📊", services: ["Monthly Bookkeeping","Financial Statements Preparation","Bank Reconciliation","MIS Reports","Tally / Zoho Accounting Setup","Fixed Asset Register","Virtual Accounting Support"] },
  { category: "Payroll & Labour Law", icon: "💰", services: ["Payroll Processing","PF / EPF Registration & Returns","ESI Registration & Returns","Professional Tax Returns","TDS on Salary (Sec 192)","Employee Full & Final Settlement","Labour Welfare Fund Compliance"] },
  { category: "Business Registrations", icon: "📋", services: ["Udyam / MSME Registration","Professional Tax Registration","Import Export Code (IEC)","FSSAI Registration","Trademark Registration Assistance","Shops & Establishments Registration","Digital Signature Certificate (DSC)"] },
  { category: "Advisory & CFO Services", icon: "🤝", services: ["Virtual CFO Services","Business Valuation","Project Report Preparation","CMA Data & Report","Startup Advisory","Merger & Acquisition Advisory","Financial Due Diligence","FEMA Compliance","Transfer Pricing"] },
];

const CLIENT_TYPES = ["Individuals / Salaried","Proprietorships","Partnership Firms","LLPs","Private Limited Companies","Startups","MSMEs","Trusts / NGOs","NRIs / Foreign Clients"];

const EMAIL_PROVIDERS = [
  { value: "default", label: "Default (mailto:)" },
  { value: "gmail", label: "Gmail" },
  { value: "outlook", label: "Outlook / Office 365" },
  { value: "zoho", label: "Zoho Mail" },
  { value: "titan", label: "Titan Mail" },
  { value: "custom", label: "Custom (enter webmail URL)" },
];

type TemplateDoc = {
  id?: string;
  doc_name: string;
  requirement: "mandatory" | "optional";
  sort_order: number;
};

function SettingsPage() {
  const queryClient = useQueryClient();
  const { triggerEvent } = useTour();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"firm" | "website" | "templates" | "email-templates">(() => {
    if (typeof window === "undefined") return "firm";
    const hash = window.location.hash;
    if (hash === "#website") return "website";
    if (hash === "#templates") return "templates";
    return "firm";
  });

  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#website") setActiveTab("website");
    if (hash === "#templates") setActiveTab("templates");
  }, []);
  const [copied, setCopied] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data?.user?.id) setCurrentUserId(data.user.id); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) setCurrentUserId(session.user.id);
      else setCurrentUserId("");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  const [form, setForm] = useState({
    firm_name: "", gst_number: "", ca_reg_number: "", address: "", state: "",
    bank_name: "", bank_account_no: "", bank_ifsc: "", invoice_prefix: "INV",
    phone: "", email: "", logo_url: "", whatsapp_number: "", website_tagline: "",
    email_provider: "default", email_custom_url: "",
  });

  const [selectedServices, setSelectedServices] = useState<string[]>(
    SERVICE_CATEGORIES.flatMap(c => c.services) // all services selected by default
  );
  const [selectedClientTypes, setSelectedClientTypes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([SERVICE_CATEGORIES[0].category]);

  // Templates
  const [selectedServiceType, setSelectedServiceType] = useState<string>(ENGAGEMENT_TYPES[0]);
  const [templateDocs, setTemplateDocs] = useState<TemplateDoc[]>([]);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [newDocName, setNewDocName] = useState("");
  const [newDocReq, setNewDocReq] = useState<"mandatory" | "optional">("mandatory");

  // ✅ Custom service types
  const [customServiceTypes, setCustomServiceTypes] = useState<string[]>([]);
  const [newServiceType, setNewServiceType] = useState("");

  const allServiceTypes = [...ENGAGEMENT_TYPES, ...customServiceTypes.filter(t => !ENGAGEMENT_TYPES.includes(t))];

  const addCustomServiceType = () => {
    const name = newServiceType.trim();
    if (!name) return;
    if (allServiceTypes.includes(name)) { alert("Service type already exists."); return; }
    setCustomServiceTypes(prev => [...prev, name]);
    setSelectedServiceType(name);
    setNewServiceType("");
    setTemplateDocs([]);
  };

  const removeCustomServiceType = (type: string) => {
    setCustomServiceTypes(prev => prev.filter(t => t !== type));
    if (selectedServiceType === type) setSelectedServiceType(ENGAGEMENT_TYPES[0]);
  };

  const { data: firmSettingsRow } = useQuery({
    queryKey: ["settings", currentUserId],
    enabled: !!currentUserId,
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").eq("user_id", currentUserId).limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as FirmSettings | null;
    },
  });

  // Load custom service types from DB (checklist_templates distinct service_type not in ENGAGEMENT_TYPES)
  useEffect(() => {
    if (!currentUserId) return;
    supabase.from("checklist_templates")
      .select("service_type")
      .eq("user_id", currentUserId)
      .then(({ data }) => {
        if (!data) return;
        const dbTypes = [...new Set(data.map((r: any) => r.service_type as string))];
        const customFromDb = dbTypes.filter(t => !ENGAGEMENT_TYPES.includes(t));
        if (customFromDb.length > 0) setCustomServiceTypes(customFromDb);
      });
  }, [currentUserId]);

  useEffect(() => {
    if (firmSettingsRow) {
      const r = firmSettingsRow as any;
      setForm({
        firm_name: r.firm_name ?? "", gst_number: r.gst_number ?? "",
        ca_reg_number: r.ca_reg_number ?? "", address: r.address ?? "",
        state: r.state ?? "", bank_name: r.bank_name ?? "",
        bank_account_no: r.bank_account_no ?? "", bank_ifsc: r.bank_ifsc ?? "",
        invoice_prefix: r.invoice_prefix ?? "INV", phone: r.phone ?? "",
        email: r.email ?? "", logo_url: r.logo_url ?? "",
        whatsapp_number: r.whatsapp_number ?? "", website_tagline: r.website_tagline ?? "",
        email_provider: r.email_provider ?? "default", email_custom_url: r.email_custom_url ?? "",
      });
      if (r.logo_url) setLogoPreview(r.logo_url);
      if (Array.isArray(r.website_services)) setSelectedServices(r.website_services);
      if (Array.isArray(r.website_client_types)) setSelectedClientTypes(r.website_client_types);
    }
  }, [firmSettingsRow]);

  const loadTemplateForService = async (serviceType: string) => {
    if (!currentUserId) return;
    const { data } = await supabase.from("checklist_templates").select("id, doc_name, requirement, sort_order").eq("user_id", currentUserId).eq("service_type", serviceType).order("sort_order", { ascending: true });
    if (data && data.length > 0) {
      setTemplateDocs(data as TemplateDoc[]);
    } else {
      const defaults = getAllTemplate(serviceType);
      setTemplateDocs(defaults.map((t, i) => ({ doc_name: t.name, requirement: t.requirement, sort_order: i })));
    }
  };

  useEffect(() => {
    if (activeTab === "templates" && currentUserId) loadTemplateForService(selectedServiceType);
  }, [activeTab, selectedServiceType, currentUserId]);

  const saveTemplate = async () => {
    if (!currentUserId) return;
    setIsSavingTemplate(true); setTemplateError(null);
    try {
      const { error: delErr } = await supabase.from("checklist_templates").delete().eq("user_id", currentUserId).eq("service_type", selectedServiceType);
      if (delErr) throw delErr;
      if (templateDocs.length > 0) {
        const rows = templateDocs.map((d, i) => ({ user_id: currentUserId, service_type: selectedServiceType, doc_name: d.doc_name, requirement: d.requirement, sort_order: i }));
        const { error: insErr } = await supabase.from("checklist_templates").insert(rows);
        if (insErr) throw insErr;
      }
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 3000);
    } catch (err: any) {
      setTemplateError("Save failed: " + (err?.message ?? ""));
    } finally { setIsSavingTemplate(false); }
  };

  const addDoc = () => {
    const name = newDocName.trim();
    if (!name) return;
    if (templateDocs.some(d => d.doc_name.toLowerCase() === name.toLowerCase())) { alert("Already exists."); return; }
    setTemplateDocs(prev => [...prev, { doc_name: name, requirement: newDocReq, sort_order: prev.length }]);
    setNewDocName("");
  };

  const removeDoc = (i: number) => setTemplateDocs(prev => prev.filter((_, idx) => idx !== i));
  const toggleDocReq = (i: number, req: "mandatory" | "optional") =>
    setTemplateDocs(prev => prev.map((d, idx) => idx === i ? { ...d, requirement: req } : d));

  const toggleService = (service: string) => setSelectedServices(prev => prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]);
  const toggleClientType = (type: string) => setSelectedClientTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  const toggleCategory = (cat: string) => setExpandedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const selectAllInCategory = (services: string[]) => setSelectedServices(prev => Array.from(new Set([...prev, ...services])));
  const clearAllInCategory = (services: string[]) => setSelectedServices(prev => prev.filter(s => !services.includes(s)));

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please upload an image file"); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Logo size must be under 2MB"); return; }
    setLogoUploading(true); setError(null);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `logos/${currentUserId}/firm-logo.${ext}`;
      const { error: uploadError } = await supabase.storage.from("firm-assets").upload(fileName, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("firm-assets").getPublicUrl(fileName);
      const urlWithCache = `${publicUrl}?t=${Date.now()}`;
      setForm(f => ({ ...f, logo_url: urlWithCache }));
      setLogoPreview(urlWithCache);
      const { data: rows } = await supabase.from("settings").select("id").eq("user_id", currentUserId).limit(1);
      const existingId = rows?.[0]?.id;
      if (existingId) await supabase.from("settings").update({ logo_url: urlWithCache }).eq("id", existingId);
      else await supabase.from("settings").insert({ logo_url: urlWithCache, user_id: currentUserId });
      queryClient.invalidateQueries({ queryKey: ["settings", currentUserId] });
    } catch (err) {
      setError("Logo upload failed: " + ((err as any)?.message ?? "Unknown error"));
    } finally { setLogoUploading(false); }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setForm(f => ({ ...f, logo_url: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null); setIsSaving(true);
    try {
      const { data: rows, error: fetchError } = await supabase.from("settings").select("id").eq("user_id", currentUserId).limit(1);
      if (fetchError) throw fetchError;
      const existingId = rows?.[0]?.id;
      const payload = {
        firm_name: form.firm_name.trim(), ca_reg_number: form.ca_reg_number.trim(),
        gst_number: form.gst_number.trim(), address: form.address.trim(),
        state: form.state.trim(), bank_name: form.bank_name.trim(),
        bank_account_no: form.bank_account_no.trim(),
        bank_ifsc: form.bank_ifsc.trim().toUpperCase(),
        invoice_prefix: form.invoice_prefix.trim().toUpperCase() || "INV",
        phone: form.phone.trim(), email: form.email.trim(),
        logo_url: form.logo_url || null,
        email_provider: form.email_provider || "default",
        email_custom_url: form.email_custom_url.trim() || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        website_tagline: form.website_tagline.trim() || null,
        website_services: selectedServices,
        website_client_types: selectedClientTypes,
        user_id: currentUserId,
      };
      if (existingId) { const { error } = await supabase.from("settings").update(payload).eq("id", existingId); if (error) throw error; }
      else { const { error } = await supabase.from("settings").insert(payload); if (error) throw error; }
      setSaved(true);
      triggerEvent("settings_saved");
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["settings", currentUserId] });
      queryClient.invalidateQueries({ queryKey: ["firm-settings"] });
    } catch (err) {
      setError("Save failed: " + ((err as any)?.message || JSON.stringify(err)));
    } finally { setIsSaving(false); }
  };

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const websiteLink = currentUserId ? `https://caclient-landing.vercel.app?ca=${currentUserId}` : "";

  return (
    <div className="space-y-6 max-w-3xl pb-48">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Firm Settings</h1>
        <p className="text-muted-foreground text-sm">Configure your firm details and website</p>
      </div>

      <div className="flex gap-2 border-b border-border flex-wrap">
        {([
          { key: "firm",            label: "🏢 Firm Details" },
          { key: "website",         label: "🌐 Website Settings" },
          { key: "templates",       label: "📋 Checklist Templates" },
          { key: "email-templates", label: "✉️ Email Templates" },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave} className="space-y-6">

        {activeTab === "firm" && (
          <>
            {/* Logo */}
            <div className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Firm Logo</h2>
              <p className="text-xs text-muted-foreground">Appears on sidebar, login page, invoices and browser tab</p>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted overflow-hidden flex-shrink-0">
                  {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" /> : <div className="text-center"><div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl mx-auto">₹</div><p className="text-xs text-muted-foreground mt-1">No logo</p></div>}
                </div>
                <div className="space-y-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={logoUploading} className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60">
                    <Upload size={15} />{logoUploading ? "Uploading..." : "Upload Logo"}
                  </button>
                  {logoPreview && <button type="button" onClick={handleRemoveLogo} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><X size={13} /> Remove Logo</button>}
                  <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2MB.</p>
                </div>
              </div>
            </div>

            {/* Firm Details */}
            <div className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-5">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Firm Details</h2>
              <div><label className="block text-sm font-medium text-foreground mb-1">Firm Name</label><input value={form.firm_name} onChange={e => setForm({...form, firm_name: e.target.value})} placeholder="CA Ismaeel & Co." className={inputClass} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-foreground mb-1">GSTIN</label><input value={form.gst_number} onChange={e => setForm({...form, gst_number: e.target.value.toUpperCase()})} className={inputClass} /></div>
                <div><label className="block text-sm font-medium text-foreground mb-1">PAN</label><input value={form.ca_reg_number} onChange={e => setForm({...form, ca_reg_number: e.target.value.toUpperCase()})} className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Address</label><textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} rows={3} className={inputClass} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-foreground mb-1">State</label><input value={form.state} onChange={e => setForm({...form, state: e.target.value})} className={inputClass} /></div>
                <div><label className="block text-sm font-medium text-foreground mb-1">Invoice Prefix</label><input value={form.invoice_prefix} onChange={e => setForm({...form, invoice_prefix: e.target.value.toUpperCase()})} placeholder="INV" className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-foreground mb-1">Phone</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className={inputClass} /></div>
                <div><label className="block text-sm font-medium text-foreground mb-1">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className={inputClass} /></div>
              </div>

              {/* Email Provider */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Email Provider for Reminders</p>
                <div>
                  <select value={form.email_provider} onChange={e => setForm({...form, email_provider: e.target.value})} className={`${inputClass} max-w-xs`}>
                    {EMAIL_PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Email reminders is provider mein khulenge · Firm email: <strong>{form.email || "—"}</strong></p>
                </div>
                {form.email_provider === "custom" && (
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">Webmail Compose URL <span className="text-red-500">*</span></label>
                    <input value={form.email_custom_url} onChange={e => setForm({...form, email_custom_url: e.target.value})} placeholder="https://webmail.yourdomain.com/compose" className={inputClass} />
                  </div>
                )}
                {form.email_provider === "titan" && <p className="text-xs text-amber-600">⚠ Titan Mail ka standard compose URL available nahi hai. "Custom" option use karein.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-foreground mb-1">Bank Name</label><input value={form.bank_name} onChange={e => setForm({...form, bank_name: e.target.value})} className={inputClass} /></div>
                <div><label className="block text-sm font-medium text-foreground mb-1">Bank Account No</label><input value={form.bank_account_no} onChange={e => setForm({...form, bank_account_no: e.target.value})} className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Bank IFSC</label><input value={form.bank_ifsc} onChange={e => setForm({...form, bank_ifsc: e.target.value.toUpperCase()})} className={`${inputClass} max-w-xs`} /></div>
            </div>
          </>
        )}

        {activeTab === "website" && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2"><span className="text-lg">🔗</span><h3 className="text-sm font-semibold text-green-800">Your Website Link</h3></div>
              <p className="text-xs text-green-700">Share this link with clients — it shows your firm's details, services and contact info automatically.</p>
              <div className="flex items-center gap-2">
                <input readOnly value={websiteLink || "Loading..."} className="flex-1 border border-green-200 rounded-md px-3 py-2 text-xs bg-white text-green-900 font-mono" />
                <button type="button" onClick={() => { if (!websiteLink) return; navigator.clipboard.writeText(websiteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }} disabled={!websiteLink} className="inline-flex items-center gap-1.5 px-3 py-2 bg-green-700 text-white rounded-md text-sm font-medium hover:bg-green-800 whitespace-nowrap disabled:opacity-50">
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
                </button>
              </div>
              <p className="text-xs text-green-600">💡 Tip: Share on WhatsApp, Instagram bio, visiting card or email signature.</p>
            </div>

            <div className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2"><Globe size={16} className="text-primary" /><h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Website Info</h2></div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">WhatsApp Number (for landing page)</label>
                <div className="flex items-center">
                  <span className="border border-input border-r-0 rounded-l-md px-3 py-2 text-sm bg-muted text-muted-foreground">+91</span>
                  <input value={form.whatsapp_number} onChange={e => setForm({...form, whatsapp_number: e.target.value})} placeholder="9920728172" className="w-full border border-input rounded-r-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div><label className="block text-sm font-medium text-foreground mb-1">Hero Tagline</label><input value={form.website_tagline} onChange={e => setForm({...form, website_tagline: e.target.value})} placeholder="Expert CA services for GST, ITR, Audit & Business Compliance" className={inputClass} /></div>
            </div>

            <div className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Clients We Serve</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CLIENT_TYPES.map(type => (
                  <label key={type} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all text-sm ${selectedClientTypes.includes(type) ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:border-primary/50"}`}>
                    <input type="checkbox" checked={selectedClientTypes.includes(type)} onChange={() => toggleClientType(type)} className="hidden" />
                    <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs ${selectedClientTypes.includes(type) ? "bg-primary border-primary text-white" : "border-input"}`}>{selectedClientTypes.includes(type) ? "✓" : ""}</span>
                    {type}
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Services Offered on Client Website</h2>
                <p className="text-xs text-muted-foreground mt-1">Select services to display on your client-facing website · {selectedServices.length} selected</p>
              </div>
              <div className="space-y-3">
                {SERVICE_CATEGORIES.map(cat => {
                  const isExpanded = expandedCategories.includes(cat.category);
                  const selectedCount = cat.services.filter(s => selectedServices.includes(s)).length;
                  return (
                    <div key={cat.category} className="border border-border rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-3 bg-muted/40 cursor-pointer hover:bg-muted/70" onClick={() => toggleCategory(cat.category)}>
                        <div className="flex items-center gap-2">
                          <span>{cat.icon}</span><span className="font-medium text-sm text-foreground">{cat.category}</span>
                          {selectedCount > 0 && <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-bold">{selectedCount}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {isExpanded && (<><button type="button" onClick={e => { e.stopPropagation(); selectAllInCategory(cat.services); }} className="text-xs text-primary hover:underline">All</button><button type="button" onClick={e => { e.stopPropagation(); clearAllInCategory(cat.services); }} className="text-xs text-muted-foreground hover:underline">None</button></>)}
                          <span className="text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {cat.services.map(service => (
                            <label key={service} className={`flex items-center gap-2 p-2 rounded-md cursor-pointer text-sm transition-all ${selectedServices.includes(service) ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                              <input type="checkbox" checked={selectedServices.includes(service)} onChange={() => toggleService(service)} className="hidden" />
                              <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center text-xs ${selectedServices.includes(service) ? "bg-primary border-primary text-white" : "border-input"}`}>{selectedServices.includes(service) ? "✓" : ""}</span>
                              {service}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === "templates" && (
          <div className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Checklist Templates</h2>
              <p className="text-xs text-muted-foreground mt-1">Customize documents for each service type. Custom template is used when creating new engagements.</p>
            </div>

            {/* Service type selector */}
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <select value={selectedServiceType} onChange={e => setSelectedServiceType(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <optgroup label="Standard Services">
                    {ENGAGEMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                  {customServiceTypes.filter(t => !ENGAGEMENT_TYPES.includes(t)).length > 0 && (
                    <optgroup label="⭐ Custom Services">
                      {customServiceTypes.filter(t => !ENGAGEMENT_TYPES.includes(t)).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <span className="text-xs text-muted-foreground">{templateDocs.length} documents</span>
                {customServiceTypes.includes(selectedServiceType) && (
                  <button type="button" onClick={() => removeCustomServiceType(selectedServiceType)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                    <Trash2 size={12} /> Remove this type
                  </button>
                )}
              </div>

              {/* ✅ Add custom service type */}
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex-wrap">
                <span className="text-xs font-semibold text-amber-700 shrink-0">+ New Service Type:</span>
                <input
                  value={newServiceType}
                  onChange={e => setNewServiceType(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomServiceType(); } }}
                  placeholder="e.g. FSSAI Compliance, RERA Filing, CSR Advisory..."
                  className="flex-1 min-w-[200px] border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button type="button" onClick={addCustomServiceType} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700 shrink-0">
                  <Plus size={13} /> Add Type
                </button>
              </div>
              <p className="text-xs text-muted-foreground">CA apni zaroorat ke hisaab se koi bhi service type add kar sakta hai — FSSAI, RERA, CSR, kuch bhi.</p>
            </div>

            {/* Docs list */}
            <div className="space-y-2">
              {templateDocs.length === 0 && <div className="text-center py-8 border border-dashed border-border rounded-lg"><p className="text-sm text-muted-foreground">No documents yet. Add below.</p></div>}
              {templateDocs.map((doc, i) => (
                <div key={i} className="flex items-center gap-2 p-2.5 border border-border rounded-md bg-card hover:bg-muted/30">
                  <div className="flex gap-1 shrink-0">
                    {(["mandatory", "optional"] as const).map(r => (
                      <button key={r} type="button" onClick={() => toggleDocReq(i, r)} className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${doc.requirement === r ? r === "mandatory" ? "bg-red-50 text-red-700 border-red-200" : "bg-slate-100 text-slate-600 border-slate-300" : "bg-card text-muted-foreground border-border hover:bg-muted"}`}>
                        {r === "mandatory" ? "M" : "O"}
                      </button>
                    ))}
                  </div>
                  <span className="text-sm text-foreground flex-1 min-w-0">{doc.doc_name}</span>
                  <button type="button" onClick={() => removeDoc(i)} className="text-muted-foreground hover:text-red-500 shrink-0"><X size={14} /></button>
                </div>
              ))}
            </div>

            {/* Add doc */}
            <div className="flex items-center gap-2 pt-3 border-t border-border flex-wrap">
              <select value={newDocReq} onChange={e => setNewDocReq(e.target.value as "mandatory" | "optional")} className="border border-input rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring shrink-0">
                <option value="mandatory">Mandatory</option>
                <option value="optional">Optional</option>
              </select>
              <input value={newDocName} onChange={e => setNewDocName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDoc(); } }} placeholder="Document name… (Enter to add)" className="flex-1 min-w-[200px] border border-input rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              <button type="button" onClick={addDoc} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 shrink-0"><Plus size={13} /> Add</button>
            </div>
            <p className="text-xs text-muted-foreground"><strong>M</strong> = Mandatory · <strong>O</strong> = Optional</p>

            <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
              <div>
                {templateError && <p className="text-sm text-red-600">{templateError}</p>}
                {templateSaved && <p className="text-sm text-green-600">✅ Template saved for {selectedServiceType}.</p>}
              </div>
              <button type="button" onClick={saveTemplate} disabled={isSavingTemplate} className="px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 font-medium">
                {isSavingTemplate ? "Saving..." : "Save Template"}
              </button>
            </div>
            <div className="pb-16" />
          </div>
        )}

        {activeTab === "email-templates" && (
          <EmailTemplatesTab userId={currentUserId} emailProvider={form.email_provider} emailCustomUrl={form.email_custom_url} />
        )}

        {activeTab !== "templates" && activeTab !== "email-templates" && (
          <div className="flex justify-end pt-2 pb-16">
            <button type="submit" disabled={isSaving} className="px-6 py-2.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 font-medium">
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-600 text-right">{error}</p>}
        {saved && <p className="text-sm text-green-600 text-right">✅ Settings saved successfully.</p>}
      </form>
    </div>
  );
}

// ─── Email Templates Tab ──────────────────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  {
    name: "Welcome Email",
    subject: "Welcome to {{firm_name}} — We're glad to have you!",
    body: `Dear {{client_name}},

Thank you for choosing {{firm_name}} for your CA services. We are delighted to have you on board.

Our team will get in touch with you shortly to understand your requirements and set up your engagement.

For any queries, feel free to reach out to us at any time.

Warm regards,
{{firm_name}}`,
  },
  {
    name: "Document Request",
    subject: "Documents Required — {{engagement_type}}",
    body: `Dear {{client_name}},

Hope you are doing well.

To proceed with your {{engagement_type}}, we need the following documents at the earliest:

1. [Document 1]
2. [Document 2]
3. [Document 3]

Kindly share these at your earliest convenience so we can complete the work on time.

If any document does not apply to you, please let us know.

Thank you,
{{firm_name}}`,
  },
  {
    name: "Payment Reminder",
    subject: "Friendly Reminder — Invoice {{invoice_number}} Due",
    body: `Dear {{client_name}},

This is a gentle reminder that Invoice {{invoice_number}} of {{amount}} is due on {{due_date}}.

Kindly arrange the payment at your earliest convenience.

For any queries regarding the invoice, please feel free to reach out.

Thank you,
{{firm_name}}`,
  },
  {
    name: "Fee Proposal",
    subject: "Fee Proposal — {{service_name}}",
    body: `Dear {{client_name}},

Thank you for reaching out to us.

Based on your requirements, we are pleased to share the following fee proposal for {{service_name}}:

Professional Fee: ₹[Amount] + GST

Scope of Work:
• [Scope point 1]
• [Scope point 2]
• [Scope point 3]

The above fee is exclusive of government fees, filing charges and out-of-pocket expenses, if any.

Please feel free to reach out for any clarifications. We look forward to serving you.

Warm regards,
{{firm_name}}`,
  },
  {
    name: "Engagement Letter",
    subject: "Engagement Letter — {{service_name}}",
    body: `Dear {{client_name}},

We are pleased to confirm our engagement for the following services:

Service: {{service_name}}
Period: [Financial Year / Period]
Professional Fee: ₹[Amount] + GST as applicable

Our Responsibilities:
• [Responsibility 1]
• [Responsibility 2]

Client Responsibilities:
• Provide accurate and complete information
• Make available required documents in time

Kindly sign and return a copy of this letter to confirm your acceptance.

Thank you for placing your trust in us.

Warm regards,
{{firm_name}}`,
  },
  {
    name: "Work Completed",
    subject: "Work Completed — {{service_name}}",
    body: `Dear {{client_name}},

We are pleased to inform you that your {{service_name}} has been completed successfully.

[Summary of work done — e.g., "Your GSTR-3B for the month of September 2026 has been filed. Acknowledgement is attached for your records."]

Please feel free to reach out if you have any queries.

Thank you for your trust in our services.

Warm regards,
{{firm_name}}`,
  },
  {
    name: "ITR Filed Confirmation",
    subject: "Your ITR has been filed — AY {{assessment_year}}",
    body: `Dear {{client_name}},

We are pleased to inform you that your Income Tax Return for AY {{assessment_year}} has been successfully filed.

Acknowledgement Number: [Ack. No.]
Date of Filing: [Date]
Tax Payable / Refund: [Amount]

The ITR-V acknowledgement is attached for your records. If applicable, please verify your return on the Income Tax portal using your Aadhaar OTP or EVC.

For any queries, feel free to contact us.

Thank you,
{{firm_name}}`,
  },
];

function EmailTemplatesTab({ userId, emailProvider, emailCustomUrl }: {
  userId: string;
  emailProvider: string;
  emailCustomUrl: string;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", subject: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSavedT] = useState(false);
  const [previewClient, setPreviewClient] = useState("Rajesh Sharma");

  const { data: customTemplates } = useQuery({
    queryKey: ["email-templates", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("email_templates")
        .select("id, name, subject, body, is_default")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const allTemplates = [
    ...DEFAULT_TEMPLATES.map(t => ({ ...t, id: null, is_default: true })),
    ...(customTemplates ?? []).filter((t: any) => !DEFAULT_TEMPLATES.find(d => d.name === t.name)),
  ];

  const replacePlaceholders = (text: string) =>
    text
      .replace(/{{client_name}}/g, previewClient)
      .replace(/{{firm_name}}/g, "CA Ismaeel & Co.")
      .replace(/{{service_name}}/g, "GST Return Filing")
      .replace(/{{engagement_type}}/g, "GST Return")
      .replace(/{{invoice_number}}/g, "INV-2026-001")
      .replace(/{{amount}}/g, "₹5,000")
      .replace(/{{due_date}}/g, "31 Oct 2026")
      .replace(/{{assessment_year}}/g, "2026-27");

  const openEmail = (t: any) => {
    const subject = encodeURIComponent(replacePlaceholders(t.subject));
    const body = encodeURIComponent(replacePlaceholders(t.body));
    let url = "";
    switch (emailProvider) {
      case "gmail":   url = `https://mail.google.com/mail/?view=cm&su=${subject}&body=${body}`; break;
      case "outlook": url = `https://outlook.live.com/mail/0/deeplink/compose?subject=${subject}&body=${body}`; break;
      case "zoho":    url = `https://mail.zoho.in/zm/#compose?subject=${subject}&body=${body}`; break;
      case "custom":  url = emailCustomUrl ? `${emailCustomUrl.replace(/\/$/, "")}?subject=${subject}&body=${body}` : `mailto:?subject=${subject}&body=${body}`; break;
      default:        url = `mailto:?subject=${subject}&body=${body}`;
    }
    window.open(url, "_blank");
  };

  const saveCustomTemplate = async () => {
    if (!editForm.name.trim()) return;
    setSaving(true);
    try {
      const existing = (customTemplates ?? []).find((t: any) => t.name === editForm.name);
      if (existing) {
        await supabase.from("email_templates").update({ subject: editForm.subject, body: editForm.body }).eq("id", existing.id);
      } else {
        await supabase.from("email_templates").insert({ user_id: userId, name: editForm.name, subject: editForm.subject, body: editForm.body });
      }
      qc.invalidateQueries({ queryKey: ["email-templates", userId] });
      setSavedT(true);
      setTimeout(() => setSavedT(false), 2000);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await supabase.from("email_templates").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["email-templates", userId] });
    if (selected?.id === id) setSelected(null);
  };

  const startEdit = (t: any) => {
    setEditForm({ name: t.name, subject: t.subject, body: t.body });
    setEditing(true);
    setSelected(t);
  };

  const startNew = () => {
    setEditForm({ name: "", subject: "", body: "" });
    setEditing(true);
    setSelected(null);
  };

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background";

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Email Templates</h2>
          <p className="text-xs text-muted-foreground mt-1">Click "Use Template" to open a pre-filled email draft. Edit and add your own templates.</p>
        </div>
        <button onClick={startNew} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
          <Plus size={15} /> New Template
        </button>
      </div>

      {/* Preview name */}
      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
        <span className="text-xs text-blue-700 font-medium shrink-0">Preview client name:</span>
        <input
          value={previewClient}
          onChange={e => setPreviewClient(e.target.value)}
          className="flex-1 text-sm bg-transparent border-none outline-none text-blue-900"
          placeholder="Rajesh Sharma"
        />
        <span className="text-xs text-blue-600">Placeholders will be replaced in preview</span>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-card border border-primary/30 rounded-lg p-4 space-y-3 shadow-sm">
          <p className="text-sm font-semibold text-foreground">{editForm.name || "New Template"}</p>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Template Name</label>
            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="e.g. GST Notice Reply" className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
            <input value={editForm.subject} onChange={e => setEditForm({ ...editForm, subject: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Body</label>
            <textarea value={editForm.body} onChange={e => setEditForm({ ...editForm, body: e.target.value })} rows={8} className={`${inputClass} font-mono text-xs`} />
          </div>
          <p className="text-xs text-muted-foreground">Placeholders: {"{{client_name}} {{firm_name}} {{service_name}} {{invoice_number}} {{amount}} {{due_date}}"}</p>
          <div className="flex gap-2">
            <button onClick={saveCustomTemplate} disabled={saving || !editForm.name.trim()} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 font-medium">
              {saving ? "Saving..." : "Save Template"}
            </button>
            {saved && <span className="text-sm text-green-600 self-center">✅ Saved!</span>}
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm rounded-md border border-input text-foreground hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {/* Templates grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {allTemplates.map((t: any, i) => (
          <div key={i} className={`bg-card border rounded-lg p-4 space-y-2 shadow-sm ${selected?.name === t.name ? "border-primary" : "border-border"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{replacePlaceholders(t.subject)}</p>
              </div>
              {t.is_default && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium shrink-0">Default</span>}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3 font-mono">{replacePlaceholders(t.body)}</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => openEmail(t)} className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2.5 py-1.5 rounded-md hover:bg-primary/90 font-medium">
                ✉️ Use Template
              </button>
              <button onClick={() => startEdit(t)} className="text-xs text-muted-foreground border border-input px-2.5 py-1.5 rounded-md hover:bg-muted font-medium">
                Edit
              </button>
              {t.id && (
                <button onClick={() => deleteTemplate(t.id)} className="text-xs text-red-500 border border-red-200 px-2.5 py-1.5 rounded-md hover:bg-red-50 font-medium">
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
