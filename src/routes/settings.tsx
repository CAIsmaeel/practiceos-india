import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Settings } from "@/lib/supabase";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — PracticeOS" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firm_name: "",
    ca_reg_number: "",
    gst_number: "",
    address: "",
    phone: "",
    email: "",
  });

  const { data: settingsRow } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("*").limit(1);
      return data?.[0] ?? null;
    },
  });

  useEffect(() => {
    if (settingsRow) {
      setForm({
        firm_name: settingsRow.firm_name ?? "",
        ca_reg_number: settingsRow.ca_reg_number ?? "",
        gst_number: settingsRow.gst_number ?? "",
        address: settingsRow.address ?? "",
        phone: settingsRow.phone ?? "",
        email: settingsRow.email ?? "",
      });
    }
  }, [settingsRow]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const firm_name = form.firm_name;
      const ca_reg_number = form.ca_reg_number;
      const gst_number = form.gst_number;
      const address = form.address;
      const phone = form.phone;
      const email = form.email;

      const existing = await supabase.from("settings").select("id").limit(1);
      const id = existing?.data?.[0]?.id;

      if (id) {
        await supabase
          .from("settings")
          .update({
            firm_name,
            ca_reg_number,
            gst_number,
            address,
            phone,
            email,
          })
          .eq("id", id);
      } else {
        await supabase.from("settings").insert({
          firm_name,
          ca_reg_number,
          gst_number,
          address,
          phone,
          email,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm">Configure your firm details</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
        className="bg-white border border-slate-200 rounded-lg shadow-sm p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Firm Name</label>
          <input
            value={form.firm_name}
            onChange={(e) => setForm({ ...form, firm_name: e.target.value })}
            placeholder="Your firm name"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">CA Registration Number</label>
            <input
              value={form.ca_registration_number}
              onChange={(e) => setForm({ ...form, ca_registration_number: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
            <input
              value={form.gst_number}
              onChange={(e) => setForm({ ...form, gst_number: e.target.value.toUpperCase() })}
              maxLength={15}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
          <textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            rows={3}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="px-5 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
        {saveMutation.isSuccess && (
          <p className="text-sm text-green-600 text-right">Settings saved successfully.</p>
        )}
      </form>
    </div>
  );
}
