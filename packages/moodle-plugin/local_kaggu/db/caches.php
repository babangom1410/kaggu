<?php
// Cache definitions for local_kaggu
defined('MOODLE_INTERNAL') || die();

$definitions = [
    'license' => [
        'mode'           => cache_store::MODE_APPLICATION,
        'ttl'            => 86400, // 24 hours
        'simplekeys'     => true,
        'simpledata'     => false,
        'staticacceleration'      => true,
        'staticaccelerationsize'  => 1,
    ],
];
