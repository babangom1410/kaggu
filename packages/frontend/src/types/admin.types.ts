export interface Organization {
  id: string;
  name: string;
  slug: string;
  contact_email: string;
  contact_name: string;
  country: string | null;
  metadata: Record<string, unknown>;
  status: 'active' | 'suspended' | 'deleted';
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  limits: Record<string, number>;
  features: Record<string, boolean>;
  is_active: boolean;
  sort_order: number;
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  canceled_at: string | null;
  subscription_plans?: SubscriptionPlan;
}

export interface LicenseKey {
  id: string;
  organization_id: string;
  subscription_id: string;
  key: string;
  status: 'active' | 'suspended' | 'revoked' | 'expired';
  moodle_url: string | null;
  moodle_site_id: string | null;
  activated_at: string | null;
  last_validated_at: string | null;
  expires_at: string | null;
  created_at: string;
  organizations?: { name: string; slug: string };
}

export interface UsageLog {
  id: string;
  organization_id: string;
  license_key_id: string | null;
  event_type: string;
  moodle_url: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  organizations?: { name: string; slug: string };
}

export interface AdminDashboardData {
  organizations: { total: number; active: number };
  licenses: { active: number };
  usage_last_30d: Record<string, number>;
  plans: SubscriptionPlan[];
}
