<?php
namespace local_kaggu;

defined('MOODLE_INTERNAL') || die();

/**
 * Manages Kàggu license validation and caching.
 *
 * Phase 3: Validates against the Kàggu API server.
 * Phase 3.5: Full SaaS quota enforcement will be added.
 */
class license_manager {

    const CACHE_KEY = 'kaggu_license_status';

    /**
     * Check if the current license is valid.
     * Uses a 24h cache to avoid hammering the license server.
     *
     * @return bool
     */
    public function is_valid(): bool {
        $status = $this->get_cached_status();
        return $status['valid'];
    }

    /**
     * Get the cached license status (validates remotely if cache is stale).
     *
     * @return array{valid: bool, plan: string, message: string}
     */
    public function get_cached_status(): array {
        $cache = \cache::make('local_kaggu', 'license');
        $cached = $cache->get(self::CACHE_KEY);

        if ($cached !== false) {
            return $cached;
        }

        $status = $this->validate_remote();
        $cache->set(self::CACHE_KEY, $status);
        return $status;
    }

    /**
     * Force a remote validation (bypasses cache).
     *
     * @return array{valid: bool, plan: string, message: string}
     */
    public function validate_remote(): array {
        $licensekey = get_config('local_kaggu', 'licensekey');
        $server     = get_config('local_kaggu', 'licenseserver') ?: 'https://kaggu-api.app.senelit.pro';

        if (empty($licensekey)) {
            return ['valid' => false, 'plan' => '', 'message' => 'No license key configured'];
        }

        // Validate key format: KGU-{TIER}-{8}-{8}-{4}
        if (!preg_match('/^KGU-[A-Z]+-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{4}$/', $licensekey)) {
            return ['valid' => false, 'plan' => '', 'message' => 'Invalid license key format'];
        }

        try {
            $curl = new \curl();
            $curl->setopt(['CURLOPT_TIMEOUT' => 10, 'CURLOPT_CONNECTTIMEOUT' => 5]);

            $response = $curl->post(
                $server . '/api/v1/licenses/validate',
                json_encode([
                    'key'        => $licensekey,
                    'moodle_url' => (new \moodle_url('/'))->out(false),
                ]),
                ['CURLOPT_HTTPHEADER' => ['Content-Type: application/json']]
            );

            if ($curl->get_errno()) {
                // Network error: use degraded mode (allow operation but log warning)
                debugging('local_kaggu: License server unreachable — operating in degraded mode', DEBUG_DEVELOPER);
                return ['valid' => true, 'plan' => 'degraded', 'message' => 'License server unreachable'];
            }

            $data = json_decode($response, true);

            if (!isset($data['data'])) {
                return ['valid' => false, 'plan' => '', 'message' => $data['error'] ?? 'Validation failed'];
            }

            $lic = $data['data'];
            $plan = strtolower($lic['plan'] ?? 'unknown');

            if ($lic['status'] === 'active') {
                return ['valid' => true, 'plan' => $plan, 'message' => "Valid — Plan: {$plan}"];
            }
            if ($lic['status'] === 'expired') {
                return ['valid' => false, 'plan' => $plan, 'message' => 'License expired'];
            }

            return ['valid' => false, 'plan' => $plan, 'message' => 'License suspended or invalid'];

        } catch (\Exception $e) {
            debugging('local_kaggu: License validation error: ' . $e->getMessage(), DEBUG_DEVELOPER);
            return ['valid' => true, 'plan' => 'degraded', 'message' => 'Validation error — degraded mode'];
        }
    }

    /**
     * Invalidate the license cache (called after saving settings).
     */
    public function invalidate_cache(): void {
        $cache = \cache::make('local_kaggu', 'license');
        $cache->delete(self::CACHE_KEY);
    }
}
