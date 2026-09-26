import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type FirmSettings } from "@/lib/supabase";
import { useState, useEffect, useRef } from "react";
import { Upload, X } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Firmora" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    firm_name: "",
    gst_number: "",
    ca_reg_number: "",
    address: "",
    state: "",
    bank_name: "",
    bank_account_no: "",
    bank_ifsc: "",
    invoice_prefix: "INV",
    phone: "",
    email: "",
    logo_url: "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const { data: firmSettingsRow } = useQuery({
    queryKey: ["settings"],
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

  useEffect(() => {
    if (firmSettingsRow) {
      setForm({
        firm_name: firmSettingsRow.firm_name ?? "",
        gst_number: firmSettingsRow.gst_number ?? "",
        ca_reg_number: firmSettingsRow.ca_reg_number ?? "",
        address: firmSettingsRow.address ?? "",
        state: firmSettingsRow.state ?? "",
        bank_name: firmSettingsRow.bank_name ?? "",
        bank_account_no: firmSettingsRow.bank_account_no ?? "",
        bank_ifsc: firmSettingsRow.bank_ifsc ?? "",
        invoice_prefix: firmSettingsRow.invoice_prefix ?? "INV",
        phone: firmSettingsRow.phone ?? "",
        email: firmSettingsRow.email ?? "",
        logo_url: (firmSettingsRow as any).logo_url ?? "",
      });
      if ((firmSettingsRow as any).logo_url) {
        setLogoPreview((firmSettingsRow as any).logo_url);
      }
    }
  }, [firmSettingsRow]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, SVG)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Logo size must be under 2MB");
      return;
    }

    setLogoUploading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ext = file.name.split(".").pop();
      const fileName = `logos/${user?.id}/firm-logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("firm-assets")
        .upload(fileName, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("firm-assets")
        .getPublicUrl(fileName);

      // Add cache buster
      const urlWithCache = `${publicUrl}?t=${Date.now()}`;
      setForm(f => ({ ...f, logo_url: urlWithCache }));
      setLogoPreview(urlWithCache);
    } catch (err) {
      setError("Logo upload failed: " + ((err as any)?.message ?? "Unknown error"));
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setForm(f => ({ ...f, logo_url: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: rows, error: fetchError } = await supabase
        .from("settings").select("id").eq("user_id", user?.id ?? "").limit(1);
      if (fetchError) throw fetchError;
      const existingId = rows?.[0]?.id;

      const settingsPayload = {
        firm_name: form.firm_name.trim(),
        ca_reg_number: form.ca_reg_number.trim(),
        gst_number: form.gst_number.trim(),
        address: form.address.trim(),
        state: form.state.trim(),
        bank_name: form.bank_name.trim(),
        bank_account_no: form.bank_account_no.trim(),
        bank_ifsc: form.bank_ifsc.trim().toUpperCase(),
        invoice_prefix: form.invoice_prefix.trim().toUpperCase() || "INV",
        phone: form.phone.trim(),
        email: form.email.trim(),
        logo_url: form.logo_url || null,
        user_id: user?.id,
      };

      if (existingId) {
        const { error } = await supabase.from("settings").update(settingsPayload).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("settings").insert(settingsPayload);
        if (error) throw error;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["firm-settings"] });
    } catch (err) {
      setError("Save failed: " + ((err as any)?.message || JSON.stringify(err)));
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = "w-full border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Firm Settings</h1>
        <p className="text-muted-foreground text-sm">Configure billing and invoice metadata for your practice</p>
      </div>

      {/* Logo Upload Section */}
      <div className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Firm Logo</h2>
        <p className="text-xs text-muted-foreground">Logo will appear on sidebar, login page, invoices and browser tab</p>

        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted overflow-hidden flex-shrink-0">
            {logoPreview ? (
              <img src={logoPreview} alt="Firm Logo" className="w-full h-full object-contain p-1" />
            ) : (
              <div className="text-center">
                <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl mx-auto">₹</div>
                <p className="text-xs text-muted-foreground mt-1">No logo</p>
              </div>
            )}
          </div>

          {/* Upload Controls */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoUploading}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-60"
            >
              <Upload size={15} />
              {logoUploading ? "Uploading..." : "Upload Logo"}
            </button>
            {logoPreview && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
              >
                <X size={13} /> Remove Logo
              </button>
            )}
            <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2MB. Square logo works best.</p>
          </div>
        </div>
      </div>

      {/* Rest of settings */}
      <form onSubmit={handleSave} className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-5">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Firm Details</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Firm Name</label>
          <input value={form.firm_name} onChange={(e) => setForm({...form, firm_name: e.target.value})} placeholder="Practice Name" className={inputClass} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">GSTIN</label>
            <input value={form.gst_number} onChange={(e) => setForm({...form, gst_number: e.target.value.toUpperCase()})} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">PAN</label>
            <input value={form.ca_reg_number} onChange={(e) => setForm({...form, ca_reg_number: e.target.value.toUpperCase()})} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Address</label>
          <textarea value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} rows={3} className={inputClass} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">State</label>
            <input value={form.state} onChange={(e) => setForm({...form, state: e.target.value})} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Invoice Prefix</label>
            <input value={form.invoice_prefix} onChange={(e) => setForm({...form, invoice_prefix: e.target.value.toUpperCase()})} placeholder="INV" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank Name</label>
            <input value={form.bank_name} onChange={(e) => setForm({...form, bank_name: e.target.value})} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank Account No</label>
            <input value={form.bank_account_no} onChange={(e) => setForm({...form, bank_account_no: e.target.value})} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank IFSC</label>
            <input value={form.bank_ifsc} onChange={(e) => setForm({...form, bank_ifsc: e.target.value.toUpperCase()})} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
            <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className={inputClass} />
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={isSaving}
            className="px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {isSaving ? "Saving..." : "Save Firm Settings"}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 text-right">{error}</p>}
        {saved && <p className="text-sm text-green-600 text-right">✅ Firm settings saved successfully.</p>}
      </form>
    </div>
  );
}
