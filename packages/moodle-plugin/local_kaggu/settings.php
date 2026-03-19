<?php
// Settings page for local_kaggu
defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_kaggu', get_string('settings', 'local_kaggu'));
    $ADMIN->add('localplugins', $settings);

    // License key field
    $licensekey_setting = new admin_setting_configtext(
        'local_kaggu/licensekey',
        get_string('licensekey', 'local_kaggu'),
        get_string('licensekey_desc', 'local_kaggu'),
        '',
        PARAM_TEXT,
        60
    );
    $licensekey_setting->set_updatedcallback(function() {
        (new \local_kaggu\license_manager())->invalidate_cache();
    });
    $settings->add($licensekey_setting);

    // License server URL
    $settings->add(new admin_setting_configtext(
        'local_kaggu/licenseserver',
        get_string('licenseserver', 'local_kaggu'),
        get_string('licenseserver_desc', 'local_kaggu'),
        'https://kaggu-api.app.senelit.pro',
        PARAM_URL,
        60
    ));

    // License status (read-only display)
    $licensemanager = new \local_kaggu\license_manager();
    $status = $licensemanager->get_cached_status();

    $statushtml = html_writer::tag('span', $status['message'], [
        'style' => 'color:' . ($status['valid'] ? 'green' : 'red'),
    ]);

    $settings->add(new admin_setting_heading(
        'local_kaggu/licensestatus',
        get_string('licensestatus', 'local_kaggu'),
        $statushtml
    ));
}
