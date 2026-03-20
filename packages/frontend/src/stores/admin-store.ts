import { create } from 'zustand';
import type { Organization, SubscriptionPlan, LicenseKey, AdminDashboardData } from '@/types/admin.types';
import * as api from '@/api/admin-api';

interface AdminState {
  dashboard: AdminDashboardData | null;
  organizations: Organization[];
  plans: SubscriptionPlan[];
  licenses: LicenseKey[];
  loading: boolean;
  error: string | null;

  fetchDashboard: () => Promise<void>;
  fetchOrganizations: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchLicenses: (org?: string) => Promise<void>;
  updateLicense: (id: string, status: string) => Promise<void>;
  regenerateLicense: (id: string) => Promise<void>;
  resetLicenseBinding: (id: string) => Promise<void>;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  dashboard: null,
  organizations: [],
  plans: [],
  licenses: [],
  loading: false,
  error: null,

  fetchDashboard: async () => {
    set({ loading: true, error: null });
    try {
      const dashboard = await api.getDashboard();
      set({ dashboard, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchOrganizations: async () => {
    set({ loading: true, error: null });
    try {
      const organizations = await api.getOrganizations();
      set({ organizations, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchPlans: async () => {
    set({ loading: true, error: null });
    try {
      const plans = await api.getPlans();
      set({ plans, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchLicenses: async (org?: string) => {
    set({ loading: true, error: null });
    try {
      const licenses = await api.getLicenses(org);
      set({ licenses, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateLicense: async (id, status) => {
    await api.updateLicense(id, status);
    await get().fetchLicenses();
  },

  regenerateLicense: async (id) => {
    await api.regenerateLicense(id);
    await get().fetchLicenses();
  },

  resetLicenseBinding: async (id) => {
    await api.resetLicenseBinding(id);
    await get().fetchLicenses();
  },
}));
