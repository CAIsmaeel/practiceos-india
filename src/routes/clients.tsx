import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, type Client } from "@/lib/supabase";
import { useState } from "react";
import { Plus, X } from "lucide-react";

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Clients — PracticeOS" }] }),
  component: ClientsPage,
});

function ClientsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Omit<Client, "id" | "created_at">) => {
      const { error } = await supabase.from("clients").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-count"] });
      setOpen(false);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm">Manage your client list</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          <Plus size={16} /> Add Client
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-left">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Firm Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Phone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && clients?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                  No clients yet.
                </td>
              </tr>
            )}
            {clients?.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{c.name}</td>
                <td className="px-5 py-3 text-slate-700">{c.firm_name ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{c.email ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">{c.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && <ClientModal onClose={() => setOpen(false)} onSubmit={addMutation.mutate} pending={addMutation.isPending} />}
    </div>
  );
}

function ClientModal({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (data: any) => void;
  pending: boolean;
}) {
  const [form, setForm] = useState({ name: "", firm_name: "", email: "", phone: "" });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Add Client</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          className="p-5 space-y-4"
        >
          {(["name", "firm_name", "email", "phone"] as const).map((f) => (
            <div key={f}>
              <label className="block text-sm font-medium text-slate-700 mb-1 capitalize">
                {f.replace("_", " ")}
                {f === "name" && <span className="text-red-500"> *</span>}
              </label>
              <input
                required={f === "name"}
                type={f === "email" ? "email" : "text"}
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
