import { createHash, randomBytes } from 'crypto';
import { supabase } from '../lib/supabase';

// ─── Key Generation ───────────────────────────────────────────────────────────

// Unambiguous alphabet: no 0, O, I, L, 1
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type LicenseTier = 'TRI' | 'STR' | 'PRO' | 'ENT';

function randomSegment(length: number): string {
  const bytes = randomBytes(length * 2);
  let result = '';
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    const idx = bytes[i] % ALPHABET.length;
    result += ALPHABET[idx];
  }
  return result;
}

export function generateLicenseKey(tier: LicenseTier): string {
  return `KGU-${tier}-${randomSegment(8)}-${randomSegment(8)}-${randomSegment(4)}`;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidatePayload {
  key: string;
  moodle_url: string;
  site_id?: string;
  moodle_version?: string;
  plugin_version?: string;
}

export interface ValidateResult {
  valid: boolean;
  plan?: { name: string; slug: string };
  limits?: Record<string, number>;
  features?: Record<string, boolean>;
  expires_at?: string | null;
  next_check_interval?: number;
  error?: string;
  message?: string;
}

export async function validateLicense(
  payload: ValidatePayload,
  ip: string,
): Promise<ValidateResult> {
  const key_hash = hashKey(payload.key);

  // Lookup license by hash
  const { data: license, error: licError } = await supabase
    .from('license_keys')
    .select(`
      id, key, status, moodle_url, moodle_site_id, expires_at, activated_at,
      subscription:subscriptions (
        status,
        plan:subscription_plans ( name, slug, limits, features )
      )
    `)
    .eq('key_hash', key_hash)
    .single();

  if (licError || !license) {
    await logUsage(null, null, 'license_validate', payload.moodle_url, ip, { error: 'key_not_found' });
    return { valid: false, error: 'LICENSE_NOT_FOUND', message: 'Clé de licence introuvable.' };
  }

  // Check license status
  if (license.status !== 'active') {
    await logUsage(null, license.id, 'license_validate', payload.moodle_url, ip, { status: license.status });
    const messages: Record<string, string> = {
      suspended: 'Cette licence est suspendue.',
      revoked:   'Cette licence a été révoquée.',
      expired:   'Cette licence a expiré.',
    };
    return { valid: false, error: `LICENSE_${license.status.toUpperCase()}`, message: messages[license.status] };
  }

  // Check expiry
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    await supabase.from('license_keys').update({ status: 'expired' }).eq('id', license.id);
    return { valid: false, error: 'LICENSE_EXPIRED', message: `Cette licence a expiré le ${license.expires_at}.` };
  }

  // Check subscription
  const sub = Array.isArray(license.subscription) ? license.subscription[0] : license.subscription;
  if (!sub || !['active', 'trialing'].includes(sub.status)) {
    return { valid: false, error: 'SUBSCRIPTION_INACTIVE', message: 'Abonnement inactif ou expiré.' };
  }

  const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan;

  // URL binding — bind on first use
  if (!license.moodle_url) {
    await supabase.from('license_keys').update({
      moodle_url:      payload.moodle_url,
      moodle_site_id:  payload.site_id ?? null,
      activated_at:    new Date().toISOString(),
      last_validated_at: new Date().toISOString(),
    }).eq('id', license.id);
  } else if (license.moodle_url !== payload.moodle_url) {
    await logUsage(null, license.id, 'license_validate', payload.moodle_url, ip, { error: 'url_mismatch', expected: license.moodle_url });
    return { valid: false, error: 'LICENSE_URL_MISMATCH', message: 'Cette licence est liée à une autre instance Moodle.' };
  } else {
    await supabase.from('license_keys').update({ last_validated_at: new Date().toISOString() }).eq('id', license.id);
  }

  // Get organization_id for logging
  const { data: orgData } = await supabase
    .from('license_keys')
    .select('organization_id')
    .eq('id', license.id)
    .single();

  await logUsage(orgData?.organization_id ?? null, license.id, 'license_validate', payload.moodle_url, ip, {
    plan: plan?.slug,
    moodle_version: payload.moodle_version,
    plugin_version: payload.plugin_version,
  });

  return {
    valid: true,
    plan:    { name: plan?.name ?? '', slug: plan?.slug ?? '' },
    limits:  plan?.limits ?? {},
    features: plan?.features ?? {},
    expires_at: license.expires_at ?? null,
    next_check_interval: 86400,
  };
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

export async function heartbeatLicense(key: string, ip: string): Promise<{ valid: boolean; expires_at?: string | null }> {
  const key_hash = hashKey(key);
  const { data: license } = await supabase
    .from('license_keys')
    .select('id, status, expires_at, organization_id')
    .eq('key_hash', key_hash)
    .single();

  if (!license || license.status !== 'active') return { valid: false };
  if (license.expires_at && new Date(license.expires_at) < new Date()) return { valid: false };

  await supabase.from('license_keys').update({ last_validated_at: new Date().toISOString() }).eq('id', license.id);
  await logUsage(license.organization_id, license.id, 'license_validate', null, ip, { type: 'heartbeat' });

  return { valid: true, expires_at: license.expires_at ?? null };
}

// ─── Admin helpers ────────────────────────────────────────────────────────────

export async function createLicenseKey(
  organizationId: string,
  subscriptionId: string,
  tier: LicenseTier,
  expiresAt?: string,
): Promise<{ id: string; key: string }> {
  const key = generateLicenseKey(tier);
  const key_hash = hashKey(key);

  const { data, error } = await supabase
    .from('license_keys')
    .insert({
      organization_id: organizationId,
      subscription_id: subscriptionId,
      key,
      key_hash,
      status: 'active',
      expires_at: expiresAt ?? null,
    })
    .select('id, key')
    .single();

  if (error) throw new Error(`Failed to create license key: ${error.message}`);
  return data;
}

// ─── Usage logging ────────────────────────────────────────────────────────────

async function logUsage(
  organizationId: string | null,
  licenseKeyId: string | null,
  eventType: string,
  moodleUrl: string | null | undefined,
  ip: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  if (!organizationId) return; // skip if no org context

  await supabase.from('usage_logs').insert({
    organization_id: organizationId,
    license_key_id:  licenseKeyId,
    event_type:      eventType,
    moodle_url:      moodleUrl ?? null,
    details,
    ip_address:      ip,
  });
}
