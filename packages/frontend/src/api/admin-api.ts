import { supabase } from '@/lib/supabase';
import type {
  Organization, SubscriptionPlan, Subscription,
  LicenseKey, UsageLog, AdminDashboardData,
} from '@/types/admin.types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.data;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.data;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT', headers: await authHeaders(), body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.data;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: await authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json.data;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
export const getDashboard = () => get<AdminDashboardData>('/api/v1/admin/usage/dashboard');

// ─── Organizations ─────────────────────────────────────────────────────────
export const getOrganizations = () => get<Organization[]>('/api/v1/admin/organizations');
export const getOrganization  = (id: string) => get<Organization>(`/api/v1/admin/organizations/${id}`);
export const createOrganization = (data: Partial<Organization>) => post<Organization>('/api/v1/admin/organizations', data);
export const updateOrganization = (id: string, data: Partial<Organization>) => put<Organization>(`/api/v1/admin/organizations/${id}`, data);
export const deleteOrganization = (id: string) => del<{ success: boolean }>(`/api/v1/admin/organizations/${id}`);

// ─── Plans ─────────────────────────────────────────────────────────────────
export const getPlans      = () => get<SubscriptionPlan[]>('/api/v1/admin/plans');
export const createPlan    = (data: Partial<SubscriptionPlan>) => post<SubscriptionPlan>('/api/v1/admin/plans', data);
export const updatePlan    = (id: string, data: Partial<SubscriptionPlan>) => put<SubscriptionPlan>(`/api/v1/admin/plans/${id}`, data);

// ─── Subscriptions ─────────────────────────────────────────────────────────
export const getSubscriptions  = (org?: string) => get<Subscription[]>(`/api/v1/admin/subscriptions${org ? `?org=${org}` : ''}`);
export const createSubscription = (data: Partial<Subscription>) => post<Subscription>('/api/v1/admin/subscriptions', data);
export const updateSubscription = (id: string, data: Partial<Subscription>) => put<Subscription>(`/api/v1/admin/subscriptions/${id}`, data);

// ─── Licenses ──────────────────────────────────────────────────────────────
export const getLicenses = (org?: string) => get<LicenseKey[]>(`/api/v1/admin/licenses${org ? `?org=${org}` : ''}`);
export const createLicense = (data: { organization_id: string; subscription_id: string; tier: string; expires_at?: string }) =>
  post<LicenseKey>('/api/v1/admin/licenses', data);
export const updateLicense  = (id: string, status: string) => put<LicenseKey>(`/api/v1/admin/licenses/${id}`, { status });
export const regenerateLicense = (id: string) => post<LicenseKey>(`/api/v1/admin/licenses/${id}/regenerate`, {});
export const resetLicenseBinding = (id: string) => del<LicenseKey>(`/api/v1/admin/licenses/${id}/binding`);

// ─── Usage ─────────────────────────────────────────────────────────────────
export const getUsageLogs = (params?: { org?: string; event_type?: string; from?: string; to?: string }) => {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return get<UsageLog[]>(`/api/v1/admin/usage${qs ? `?${qs}` : ''}`);
};
