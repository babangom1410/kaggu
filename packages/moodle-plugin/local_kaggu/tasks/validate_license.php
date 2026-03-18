<?php
namespace local_kaggu\task;

defined('MOODLE_INTERNAL') || die();

/**
 * Scheduled task: revalidate the Kàggu license every 24 hours.
 */
class validate_license extends \core\task\scheduled_task {

    public function get_name(): string {
        return get_string('pluginname', 'local_kaggu') . ' — License Validation';
    }

    public function execute(): void {
        $manager = new \local_kaggu\license_manager();
        $manager->invalidate_cache();
        $status = $manager->validate_remote();

        mtrace('local_kaggu license status: ' . $status['message']);

        if (!$status['valid'] && $status['plan'] !== 'degraded') {
            debugging('local_kaggu: License is not valid. Export functionality will be disabled.', DEBUG_NORMAL);
        }
    }
}
