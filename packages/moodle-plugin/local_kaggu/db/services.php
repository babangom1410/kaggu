<?php
// Web service function definitions for local_kaggu
defined('MOODLE_INTERNAL') || die();

$functions = [

    'local_kaggu_ensure_section' => [
        'classname'     => 'local_kaggu\external',
        'methodname'    => 'ensure_section',
        'description'   => 'Create a course section if it does not exist and update its name/summary.',
        'type'          => 'write',
        'capabilities'  => 'moodle/course:manageactivities',
        'ajax'          => false,
        'loginrequired' => true,
    ],

    'local_kaggu_create_module' => [
        'classname'     => 'local_kaggu\external',
        'methodname'    => 'create_module',
        'description'   => 'Create a module (activity or resource) in a course section.',
        'type'          => 'write',
        'capabilities'  => 'moodle/course:manageactivities',
        'ajax'          => false,
        'loginrequired' => true,
    ],

    'local_kaggu_update_module' => [
        'classname'     => 'local_kaggu\external',
        'methodname'    => 'update_module',
        'description'   => 'Update the settings of an existing course module.',
        'type'          => 'write',
        'capabilities'  => 'moodle/course:manageactivities',
        'ajax'          => false,
        'loginrequired' => true,
    ],

    'local_kaggu_delete_module' => [
        'classname'     => 'local_kaggu\external',
        'methodname'    => 'delete_module',
        'description'   => 'Delete a course module.',
        'type'          => 'write',
        'capabilities'  => 'moodle/course:manageactivities',
        'ajax'          => false,
        'loginrequired' => true,
    ],
];

$services = [
    'Kàggu Web Services' => [
        'functions' => array_merge(array_keys($functions), [
            // Native Moodle functions required by Kàggu
            'core_webservice_get_site_info',
            'core_course_create_courses',
            'core_course_update_courses',
            'core_course_get_contents',
            'core_course_get_categories',
            'core_course_get_courses',
        ]),
        'restrictedusers' => 0,
        'enabled'         => 1,
        'shortname'       => 'local_kaggu',
    ],
];
