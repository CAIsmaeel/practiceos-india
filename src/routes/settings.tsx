import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, type FirmSettings } from "@/lib/supabase";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — PracticeOS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
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
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      });
    }
  }, [firmSettingsRow]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: rows, error: fetchError } = await supabase
        .from("settings")
        .select("id")
        .eq("user_id", user?.id ?? "")
        .limit(1);

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
        user_id: user?.id,
      };

      if (existingId) {
        const { error } = await supabase
          .from("settings")
          .update(settingsPayload)
          .eq("id", existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("settings")
          .insert(settingsPayload);
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

      <form
        onSubmit={handleSave}
        className="bg-card border border-border rounded-lg shadow-sm p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Firm Name</label>
          <input
            value={form.firm_name}
            onChange={(e) => setForm({ ...form, firm_name: e.target.value })}
            placeholder="Practice Name"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">GSTIN</label>
            <input
              value={form.gst_number}
              onChange={(e) => setForm({ ...form, gst_number: e.target.value.toUpperCase() })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">PAN</label>
            <input
              value={form.ca_reg_number}
              onChange={(e) => setForm({ ...form, ca_reg_number: e.target.value.toUpperCase() })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Address</label>
          <textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            rows={3}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">State</label>
            <input
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Invoice Prefix</label>
            <input
              value={form.invoice_prefix}
              onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value.toUpperCase() })}
              placeholder="INV"
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank Name</label>
            <input
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank Account No</label>
            <input
              value={form.bank_account_no}
              onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Bank IFSC</label>
            <input
              value={form.bank_ifsc}
              onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value.toUpperCase() })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Firm Settings"}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 text-right">{error}</p>}
        {saved && <p className="text-sm text-green-600 text-right">Firm settings saved successfully.</p>}
      </form>
    </div>
  );
}
