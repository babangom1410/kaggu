<?php
// Language file for local_kaggu (English)
defined('MOODLE_INTERNAL') || die();

$string['pluginname']            = 'Kàggu — Moodle Course Designer';
$string['privacy:metadata']      = 'The Kàggu plugin does not store any personal data.';

// Settings
$string['settings']              = 'Kàggu Settings';
$string['licensekey']            = 'License Key';
$string['licensekey_desc']       = 'Enter your Kàggu license key (format: KGU-TIER-XXXXXXXX-XXXXXXXX-XXXX).';
$string['licenseserver']         = 'License Server URL';
$string['licenseserver_desc']    = 'URL of the Kàggu licensing server. Do not change unless instructed.';
$string['licensestatus']         = 'License Status';
$string['licensestatus_desc']    = 'Current status of the Kàggu license.';
$string['licensevalid']          = 'Valid — Plan: {$a}';
$string['licenseinvalid']        = 'Invalid or not configured';
$string['licenseexpired']        = 'Expired';
$string['licensesuspended']      = 'Suspended';

// Errors
$string['error_license_invalid'] = 'Kàggu: Invalid or missing license key.';
$string['error_license_expired'] = 'Kàggu: Your license has expired. Please renew your subscription.';
$string['error_license_quota']   = 'Kàggu: Usage quota exceeded for your plan.';
$string['error_module_type']     = 'Kàggu: Unsupported module type: {$a}';
$string['error_course_not_found']= 'Kàggu: Course not found.';
$string['error_capability']      = 'Kàggu: Insufficient permissions.';
