import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xjcknltsldywczvqmzwp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TJWY8tPSJP60FBZCq2oYpA_9NNNb7VX";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
};

export type EngagementType =
  | "GST Return"
  | "ITR Filing"
  | "Statutory Audit"
  | "Tax Audit"
  | "ROC Filing"
  | "MCA Compliance"
  | "Other";

export type EngagementStatus = "pending" | "in_progress" | "completed" | "billed";

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
  is_complete: boolean;
  created_at: string;
  engagements?: { title: string } | null;
};

export type InvoiceStatus = "Pending" | "Overdue" | "Paid";

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
  clients?: { name: string; firm_name: string | null } | null;
};

export type Settings = {
  id: string;
  firm_name: string | null;
  logo_url: string | null;
  ca_registration_number: string | null;
  gst_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  updated_at: string;
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
