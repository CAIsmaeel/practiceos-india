import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xjcknltsldywczvqmzwp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqY2tubHRzbGR5d2N6dnFtendwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NTM3ODksImV4cCI6MjA5ODAyOTc4OX0.qAijhwhTg1-OD0avyMgh59r_ai3OC5T47R6C7HQi8mY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type Client = {
  id: string;
  name: string;
  firm_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  status: string | null;
  pan_number: string | null;
  gst_number: string | null;
  whatsapp_number: string | null;
  client_type: string | null;
  notes: string | null;
  gst_registered?: boolean | null;
  gst_turnover_above_2cr?: boolean | null;
  tds_applicable?: boolean | null;
  pf_applicable?: boolean | null;
  ptec_applicable?: boolean | null;
  advance_tax_applicable?: boolean | null;
};

export type EngagementType = string;

export type EngagementStatus = string;

export type Engagement = {
  id: string;
  client_id: string;
  title: string;
  type: EngagementType;
  deadline: string | null;
  status: EngagementStatus;
  assigned_to: string | null;
  created_at: string;
  clients?: { name: string; firm_name: string | null } | null;
};

export type Task = {
  id: string;
  engagement_id: string;
  title: string;
  assigned_to: string | null;
  due_date: string | null;
  is_complete: boolean;
  created_at: string;
  engagements?: { title: string } | null;
};

export type ComplianceItem = {
  id: string;
  client_id: string;
  compliance_type: string | null;
  compliance_name: string | null;
  due_date: string | null;
  status: string | null;
  filed_date: string | null;
  financial_year: string | null;
  notes: string | null;
  created_at: string;
  clients?: { name: string; client_type?: string | null } | null;
};

export type InvoiceStatus = "Pending" | "Overdue" | "Unpaid" | "Paid";

export type Invoice = {
  id: string;
  client_id: string;
  amount: number;
  due_date: string | null;
  status: string;
  payment_date: string | null;
  reminder_count: number;
  created_at: string;
  invoice_number: string | null;
  description: string | null;
  base_amount: number | null;
  gst_rate: number | null;
  gst_amount: number | null;
  total_amount: number | null;
  notes: string | null;
  clients?: {
    name: string;
    firm_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export type Settings = {
  id: string;
  firm_name: string | null;
  ca_reg_number: string | null;
  gst_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  state?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  invoice_prefix?: string | null;
  logo_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type FirmSettings = {
  id: string;
  firm_name: string | null;
  ca_reg_number: string | null;
  gst_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  state?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  invoice_prefix?: string | null;
  logo_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type QueryLog = {
  id: string;
  channel: string | null;
  contact: string | null;
  query_text: string | null;
  ai_response: string | null;
  created_at: string;
};

export type ErrorLog = {
  id: string;
  workflow_name: string | null;
  node_name: string | null;
  error_message: string | null;
  created_at: string;
};
// Helper — current logged in user ka ID
export const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
};