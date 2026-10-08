import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, getCurrentUserId } from '@/lib/supabase'

export const Route = createFileRoute('/clients')({
  component: ClientsPage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = {
  id: string
  name: string
  email: string | null
  phone: string | null
  gstin: string | null
  pan: string | null
  entity_type: string | null
  address: string | null
  notes: string | null
  created_at: string
}

type ClientDoc = {
  id: string
  client_id: string
  doc_type: string
  doc_label: string | null
  expiry_date: string | null
  notes: string | null
}

type ClientService = {
  id: string
  client_id: string
  service_name: string
  frequency: 'monthly' | 'quarterly' | 'halfyearly' | 'annually'
  due_day: number
  due_month: number | null
  last_filed_date: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES = [
  'DSC', 'FSSAI License', 'Shop Act', 'Trade License', 'IEC Code',
  'Insurance', 'Drug License', 'MSME', 'GST Registration', 'Trademark', 'Other',
]

const FREQ_LABELS: Record<ClientService['frequency'], string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  halfyearly: 'Half-Yearly',
  annually: 'Annually',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const ENTITY_TYPES = [
  'Individual', 'Proprietorship', 'Partnership', 'LLP', 'Private Limited',
  'Public Limited', 'HUF', 'Trust', 'Society', 'Other',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function asISO(dateStr: string): string {
  // Prevents UTC-shift by treating date as local midnight
  const [y, m, d] = dateStr.split('-').map(Number)
  return toLocalISO(new Date(y, m - 1, d))
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const [y, m, d] = dateStr.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  return Math.round((target.getTime() - now.getTime()) / 86400000)
}

// ─── ClientDocumentsSection ───────────────────────────────────────────────────

function ClientDocumentsSection({ clientId, userId }: { clientId: string; userId: string }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ doc_type: DOC_TYPES[0], doc_label: '', expiry_date: '', notes: '' })

  const { data: docs = [] } = useQuery<ClientDoc[]>({
    queryKey: ['client_documents', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_documents')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  const addMut = useMutation({
    mutationFn: async (vals: typeof form) => {
      const { error } = await supabase.from('client_documents').insert({
        client_id: clientId,
        user_id: userId,
        doc_type: vals.doc_type,
        doc_label: vals.doc_label || null,
        expiry_date: vals.expiry_date ? asISO(vals.expiry_date) : null,
        notes: vals.notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client_documents', clientId] })
      setShowAdd(false)
      setForm({ doc_type: DOC_TYPES[0], doc_label: '', expiry_date: '', notes: '' })
    },
  })

  const editMut = useMutation({
    mutationFn: async ({ id, vals }: { id: string; vals: typeof form }) => {
      const { error } = await supabase.from('client_documents').update({
        doc_type: vals.doc_type,
        doc_label: vals.doc_label || null,
        expiry_date: vals.expiry_date ? asISO(vals.expiry_date) : null,
        notes: vals.notes || null,
      }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client_documents', clientId] })
      setEditId(null)
    },
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_documents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client_documents', clientId] }),
  })

  function startEdit(doc: ClientDoc) {
    setEditId(doc.id)
    setForm({
      doc_type: doc.doc_type,
      doc_label: doc.doc_label ?? '',
      expiry_date: doc.expiry_date ?? '',
      notes: doc.notes ?? '',
    })
  }

  function expiryChip(dateStr: string | null) {
    if (!dateStr) return null
    const days = daysUntil(dateStr)
    if (days < 0) return <span className="badge bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 text-xs px-2 py-0.5 rounded-full">Expired {Math.abs(days)}d ago</span>
    if (days <= 30) return <span className="badge bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200 text-xs px-2 py-0.5 rounded-full">{days}d left</span>
    return <span className="badge bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200 text-xs px-2 py-0.5 rounded-full">{days}d left</span>
  }

  const DocForm = ({ vals, setVals, onSave, onCancel, saving }: {
    vals: typeof form
    setVals: (v: typeof form) => void
    onSave: () => void
    onCancel: () => void
    saving: boolean
  }) => (
    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Document Type</label>
          <select
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value={vals.doc_type}
            onChange={e => setVals({ ...vals, doc_type: e.target.value })}
          >
            {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Label (e.g. Director name)</label>
          <input
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Optional"
            value={vals.doc_label}
            onChange={e => setVals({ ...vals, doc_label: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Expiry Date</label>
          <input
            type="date"
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value={vals.expiry_date}
            onChange={e => setVals({ ...vals, expiry_date: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">Notes</label>
          <input
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Optional"
            value={vals.notes}
            onChange={e => setVals({ ...vals, notes: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
        <button onClick={onSave} disabled={saving} className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Document Expiry</h3>
        <button
          onClick={() => { setShowAdd(true); setEditId(null) }}
          className="text-xs px-2.5 py-1 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
        >
          + Add Document
        </button>
      </div>

      {showAdd && (
        <DocForm
          vals={form}
          setVals={setForm}
          onSave={() => addMut.mutate(form)}
          onCancel={() => setShowAdd(false)}
          saving={addMut.isPending}
        />
      )}

      {docs.length === 0 && !showAdd && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No documents added yet.</p>
      )}

      <div className="space-y-2">
        {docs.map(doc => (
          <div key={doc.id} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800/50">
            {editId === doc.id ? (
              <DocForm
                vals={form}
                setVals={setForm}
                onSave={() => editMut.mutate({ id: doc.id, vals: form })}
                onCancel={() => setEditId(null)}
                saving={editMut.isPending}
              />
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{doc.doc_type}</span>
                    {doc.doc_label && <span className="text-xs text-gray-500 dark:text-gray-400">— {doc.doc_label}</span>}
                    {expiryChip(doc.expiry_date)}
                  </div>
                  {doc.expiry_date && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Expires: {new Date(doc.expiry_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                  {doc.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(doc)} className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200 px-1.5 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30">Edit</button>
                  <button onClick={() => delMut.mutate(doc.id)} className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">Del</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ClientServicesSection ────────────────────────────────────────────────────

function ClientServicesSection({ clientId, userId }: { clientId: string; userId: string }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [svcForm, setSvcForm] = useState<{
    service_name: string
    frequency: ClientService['frequency']
    due_day: string
    due_month: string
  }>({ service_name: '', frequency: 'monthly', due_day: '20', due_month: '' })

  const { data: services = [] } = useQuery<ClientService[]>({
    queryKey: ['client_services', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_services')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const addMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('client_services').insert({
        client_id: clientId,
        user_id: userId,
        service_name: svcForm.service_name,
        frequency: svcForm.frequency,
        due_day: parseInt(svcForm.due_day) || 20,
        due_month: svcForm.frequency === 'annually' && svcForm.due_month ? parseInt(svcForm.due_month) : null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client_services', clientId] })
      setShowAdd(false)
      setSvcForm({ service_name: '', frequency: 'monthly', due_day: '20', due_month: '' })
    },
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_services').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client_services', clientId] }),
  })

  // Compute next due date for a service
  function nextDue(s: ClientService): Date {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yr = today.getFullYear()
    const mo = today.getMonth() // 0-indexed

    if (s.frequency === 'monthly') {
      let d = new Date(yr, mo, s.due_day)
      if (d <= today) d = new Date(yr, mo + 1, s.due_day)
      return d
    }
    if (s.frequency === 'quarterly') {
      const quarterStarts = [0, 3, 6, 9]
      for (const qs of quarterStarts) {
        const d = new Date(yr, qs + 2, s.due_day) // end of quarter month
        if (d > today) return d
      }
      return new Date(yr + 1, 2, s.due_day)
    }
    if (s.frequency === 'halfyearly') {
      const opts = [new Date(yr, 5, s.due_day), new Date(yr, 11, s.due_day)]
      for (const d of opts) if (d > today) return d
      return new Date(yr + 1, 5, s.due_day)
    }
    // annually
    const dueMonth = (s.due_month ?? 2) // 1-indexed, default March
    const d = new Date(yr, dueMonth - 1, s.due_day)
    if (d <= today) return new Date(yr + 1, dueMonth - 1, s.due_day)
    return d
  }

  function dueLabel(s: ClientService): string {
    const d = nextDue(s)
    const days = Math.round((d.getTime() - Date.now()) / 86400000)
    const fmt = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    if (days < 0) return `Overdue (${fmt})`
    if (days === 0) return `Due today`
    if (days <= 7) return `${days}d — ${fmt}`
    return fmt
  }

  function freqBadgeColor(f: ClientService['frequency']) {
    return {
      monthly: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      quarterly: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
      halfyearly: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
      annually: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    }[f]
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recurring Services</h3>
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs px-2.5 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 hover:bg-purple-100"
        >
          + Add Service
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Service Name</label>
              <input
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                placeholder="e.g. GST Filing, TDS Return"
                value={svcForm.service_name}
                onChange={e => setSvcForm({ ...svcForm, service_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Frequency</label>
              <select
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                value={svcForm.frequency}
                onChange={e => setSvcForm({ ...svcForm, frequency: e.target.value as ClientService['frequency'] })}
              >
                {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Due Day (of month)</label>
              <input
                type="number"
                min={1} max={31}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                value={svcForm.due_day}
                onChange={e => setSvcForm({ ...svcForm, due_day: e.target.value })}
              />
            </div>
            {svcForm.frequency === 'annually' && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Due Month</label>
                <select
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={svcForm.due_month}
                  onChange={e => setSvcForm({ ...svcForm, due_month: e.target.value })}
                >
                  <option value="">Select month</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
            <button
              onClick={() => addMut.mutate()}
              disabled={!svcForm.service_name.trim() || addMut.isPending}
              className="text-xs px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {addMut.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {services.length === 0 && !showAdd && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No recurring services added yet.</p>
      )}

      <div className="space-y-2">
        {services.map(svc => {
          const label = dueLabel(svc)
          const isUrgent = nextDue(svc).getTime() - Date.now() < 7 * 86400000
          return (
            <div key={svc.id} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800/50 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{svc.service_name}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${freqBadgeColor(svc.frequency)}`}>{FREQ_LABELS[svc.frequency]}</span>
                </div>
                <p className={`text-xs mt-0.5 ${isUrgent ? 'text-red-500 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                  Next due: {label}
                </p>
              </div>
              <button onClick={() => delMut.mutate(svc.id)} className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">Del</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
// ─── ClientModal ─────────────────────────────────────────────────────────────

type ClientModalProps = {
  initialClient?: Client
  onClose: () => void
  onSaved: () => void
}

function ClientModal({ initialClient, onClose, onSaved }: ClientModalProps) {
  const isEdit = Boolean(initialClient?.id)
  const [formTab, setFormTab] = useState<'info' | 'docs' | 'services'>('info')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: initialClient?.name ?? '',
    email: initialClient?.email ?? '',
    phone: initialClient?.phone ?? '',
    gstin: initialClient?.gstin ?? '',
    pan: initialClient?.pan ?? '',
    entity_type: initialClient?.entity_type ?? '',
    address: initialClient?.address ?? '',
    notes: initialClient?.notes ?? '',
  })

  useEffect(() => {
    getCurrentUserId().then(setCurrentUserId)
  }, [])

  const qc = useQueryClient()

  const saveMut = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        const { error } = await supabase.from('clients').update({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          gstin: form.gstin || null,
          pan: form.pan || null,
          entity_type: form.entity_type || null,
          address: form.address || null,
          notes: form.notes || null,
        }).eq('id', initialClient!.id)
        if (error) throw error
      } else {
        const uid = await getCurrentUserId()
        const { error } = await supabase.from('clients').insert({
          user_id: uid,
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          gstin: form.gstin || null,
          pan: form.pan || null,
          entity_type: form.entity_type || null,
          address: form.address || null,
          notes: form.notes || null,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      onSaved()
    },
  })

  const field = (label: string, key: keyof typeof form, type = 'text', placeholder = '') => (
    <div>
      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      <input
        type={type}
        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isEdit ? 'Edit Client' : 'Add Client'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>

        {/* Tabs — only in edit mode */}
        {isEdit && (
          <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
            {([
              { key: 'info', label: '📋 Info' },
              { key: 'docs', label: '📂 Documents' },
              { key: 'services', label: '🔁 Services' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setFormTab(tab.key)}
                className={`text-sm px-4 py-2.5 border-b-2 font-medium transition-colors ${
                  formTab === tab.key
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Info Tab */}
          {(formTab === 'info' || !isEdit) && (
            <div className="space-y-3">
              {field('Client Name *', 'name', 'text', 'Full name or business name')}
              <div className="grid grid-cols-2 gap-3">
                {field('Email', 'email', 'email', 'client@example.com')}
                {field('Phone', 'phone', 'tel', '+91 98765 43210')}
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Entity Type</label>
                <select
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={form.entity_type}
                  onChange={e => setForm({ ...form, entity_type: e.target.value })}
                >
                  <option value="">Select type</option>
                  {ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {field('GSTIN', 'gstin', 'text', '27AABCX1234A1ZX')}
                {field('PAN', 'pan', 'text', 'AABCX1234A')}
              </div>
              {field('Address', 'address', 'text', 'Full address')}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
                <textarea
                  rows={3}
                  className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  placeholder="Any additional notes"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {formTab === 'docs' && isEdit && initialClient?.id && currentUserId && (
            <ClientDocumentsSection clientId={initialClient.id} userId={currentUserId} />
          )}

          {/* Services Tab */}
          {formTab === 'services' && isEdit && initialClient?.id && currentUserId && (
            <ClientServicesSection clientId={initialClient.id} userId={currentUserId} />
          )}
        </div>

        {/* Footer — only show Save on Info tab */}
        {(formTab === 'info' || !isEdit) && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancel
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={!form.name.trim() || saveMut.isPending}
              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium"
            >
              {saveMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Client'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ExpiryTracker ────────────────────────────────────────────────────────────

type ExpiryEntry = {
  client_id: string
  client_name: string
  doc_type: string
  doc_label: string | null
  expiry_date: string
  doc_id: string
}

const TIMELINE_GROUPS = [
  { label: 'Overdue', filter: (days: number) => days < 0, color: 'bg-red-500' },
  { label: 'This Week', filter: (days: number) => days >= 0 && days <= 7, color: 'bg-orange-500' },
  { label: 'This Month', filter: (days: number) => days > 7 && days <= 30, color: 'bg-yellow-500' },
  { label: 'Next 3 Months', filter: (days: number) => days > 30 && days <= 90, color: 'bg-green-500' },
]

function ExpiryTracker({ onClose }: { onClose: () => void }) {
  const [renewedEntries, setRenewedEntries] = useState<Set<string>>(new Set())

  const { data: entries = [], isLoading } = useQuery<ExpiryEntry[]>({
    queryKey: ['expiry_tracker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_documents')
        .select('id, client_id, doc_type, doc_label, expiry_date, clients(name)')
        .not('expiry_date', 'is', null)
        .lte('expiry_date', toLocalISO(new Date(Date.now() + 90 * 86400000)))
        .order('expiry_date', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        doc_id: r.id,
        client_id: r.client_id,
        client_name: r.clients?.name ?? 'Unknown',
        doc_type: r.doc_type,
        doc_label: r.doc_label,
        expiry_date: r.expiry_date,
      }))
    },
  })

  function toggleRenewed(id: string) {
    setRenewedEntries(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const pendingEntries = entries.filter(e => !renewedEntries.has(e.doc_id))
  const markedRenewed = entries.filter(e => renewedEntries.has(e.doc_id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Document Expiry Tracker</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Next 90 days</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {isLoading ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Loading…</p>
          ) : pendingEntries.length === 0 && markedRenewed.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">No documents expiring in the next 90 days 🎉</p>
          ) : (
            <>
              {/* Timeline groups — only pending entries */}
              {TIMELINE_GROUPS.map(group => {
                const grouped = pendingEntries.filter(e => group.filter(daysUntil(e.expiry_date)))
                if (grouped.length === 0) return null
                return (
                  <div key={group.label}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${group.color}`} />
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{group.label}</h3>
                      <span className="text-xs text-gray-400 dark:text-gray-500">({grouped.length})</span>
                    </div>
                    <div className="space-y-1.5 ml-4">
                      {grouped.map(e => {
                        const days = daysUntil(e.expiry_date)
                        return (
                          <div key={e.doc_id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{e.client_name}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                {e.doc_type}{e.doc_label ? ` — ${e.doc_label}` : ''} · {new Date(e.expiry_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                {days < 0 ? ` (${Math.abs(days)}d ago)` : days === 0 ? ' (today)' : ` (${days}d)`}
                              </p>
                            </div>
                            <button
                              onClick={() => toggleRenewed(e.doc_id)}
                              className="text-xs px-2.5 py-1 rounded-full border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 shrink-0 whitespace-nowrap"
                            >
                              ✓ Renewed
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Renewed section — outside the map, shown once at the bottom */}
              {markedRenewed.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-400 dark:text-gray-500">Marked as Renewed</h3>
                    <span className="text-xs text-gray-400 dark:text-gray-500">({markedRenewed.length})</span>
                  </div>
                  <div className="space-y-1.5 ml-4">
                    {markedRenewed.map(e => (
                      <div key={e.doc_id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 gap-2 opacity-60">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 line-through truncate">{e.client_name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{e.doc_type}{e.doc_label ? ` — ${e.doc_label}` : ''}</p>
                        </div>
                        <button
                          onClick={() => toggleRenewed(e.doc_id)}
                          className="text-xs px-2.5 py-1 rounded-full border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"
                        >
                          Undo
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ClientsPage ──────────────────────────────────────────────────────────────

function ClientsPage() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | undefined>(undefined)
  const [showTracker, setShowTracker] = useState(false)
  const qc = useQueryClient()

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  })

  const filtered = clients.filter(c =>
    [c.name, c.email, c.phone, c.gstin, c.pan].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  )

  function openAdd() {
    setEditClient(undefined)
    setShowModal(true)
  }

  function openEdit(c: Client) {
    setEditClient(c)
    setShowModal(true)
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clients</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{clients.length} total clients</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowTracker(true)}
            className="text-sm px-4 py-2 rounded-xl border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 font-medium"
          >
            📅 Expiry Tracker
          </button>
          <button
            onClick={openAdd}
            className="text-sm px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium shadow-sm"
          >
            + Add Client
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        <input
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="Search by name, email, GSTIN, PAN…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">Loading clients…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-gray-500 dark:text-gray-400">{search ? 'No clients match your search.' : 'No clients yet. Add your first client!'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">GSTIN</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Entity</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map(c => (
                <tr key={c.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{c.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 md:hidden">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden sm:table-cell">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{c.gstin ?? '—'}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {c.entity_type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">{c.entity_type}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(c)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${c.name}? This cannot be undone.`)) {
                            delMut.mutate(c.id)
                          }
                        }}
                        className="text-xs px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <ClientModal
          initialClient={editClient}
          onClose={() => setShowModal(false)}
          onSaved={() => setShowModal(false)}
        />
      )}
      {showTracker && <ExpiryTracker onClose={() => setShowTracker(false)} />}
    </div>
  )
}
