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
