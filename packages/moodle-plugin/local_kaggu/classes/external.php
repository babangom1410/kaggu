<?php
namespace local_kaggu;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/externallib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/course/modlib.php');

/**
 * External (Web Service) functions for local_kaggu.
 */
class external extends \external_api {

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Check license and capability before any write operation.
     * @throws \moodle_exception
     */
    private static function check_license_and_capability(int $courseid): \stdClass {
        global $DB;

        $license = new license_manager();
        if (!$license->is_valid()) {
            throw new \moodle_exception('error_license_invalid', 'local_kaggu');
        }

        $course = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
        $context = \context_course::instance($courseid);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        return $course;
    }

    // ─── ensure_section ──────────────────────────────────────────────────────

    public static function ensure_section_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid'   => new \external_value(PARAM_INT,  'Course ID'),
            'sectionnum' => new \external_value(PARAM_INT,  'Section number (1-based)'),
            'name'       => new \external_value(PARAM_TEXT, 'Section name'),
            'summary'    => new \external_value(PARAM_RAW,  'Section summary (HTML)', VALUE_DEFAULT, ''),
        ]);
    }

    public static function ensure_section(int $courseid, int $sectionnum, string $name, string $summary = ''): array {
        global $DB;

        $params = self::validate_parameters(self::ensure_section_parameters(), [
            'courseid'   => $courseid,
            'sectionnum' => $sectionnum,
            'name'       => $name,
            'summary'    => $summary,
        ]);

        $course = self::check_license_and_capability($params['courseid']);

        // Create section if it doesn't exist
        course_create_sections_if_missing($course, $params['sectionnum']);

        $section = $DB->get_record('course_sections', [
            'course'  => $params['courseid'],
            'section' => $params['sectionnum'],
        ], '*', MUST_EXIST);

        // Update name and summary
        $DB->update_record('course_sections', (object)[
            'id'            => $section->id,
            'name'          => $params['name'],
            'summary'       => $params['summary'],
            'summaryformat' => FORMAT_HTML,
        ]);

        rebuild_course_cache($params['courseid'], true);

        return [
            'sectionid'  => (int) $section->id,
            'sectionnum' => (int) $params['sectionnum'],
        ];
    }

    public static function ensure_section_returns(): \external_single_structure {
        return new \external_single_structure([
            'sectionid'  => new \external_value(PARAM_INT, 'Database ID of the section'),
            'sectionnum' => new \external_value(PARAM_INT, 'Section number'),
        ]);
    }

    // ─── create_module ───────────────────────────────────────────────────────

    public static function create_module_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid'   => new \external_value(PARAM_INT,  'Course ID'),
            'sectionnum' => new \external_value(PARAM_INT,  'Section number (1-based)'),
            'moduletype' => new \external_value(PARAM_ALPHANUMEXT, 'Module type (assign, quiz, forum, url, page)'),
            'name'       => new \external_value(PARAM_TEXT, 'Module name'),
            'intro'      => new \external_value(PARAM_RAW,  'Module description (HTML)', VALUE_DEFAULT, ''),
            'visible'    => new \external_value(PARAM_INT,  'Visibility (1=visible, 0=hidden)', VALUE_DEFAULT, 1),
            'options'    => new \external_multiple_structure(
                new \external_single_structure([
                    'name'  => new \external_value(PARAM_ALPHANUMEXT, 'Option name'),
                    'value' => new \external_value(PARAM_RAW, 'Option value'),
                ]),
                'Module-specific options',
                VALUE_DEFAULT,
                []
            ),
        ]);
    }

    public static function create_module(
        int $courseid,
        int $sectionnum,
        string $moduletype,
        string $name,
        string $intro = '',
        int $visible = 1,
        array $options = []
    ): array {
        global $CFG, $DB;

        $params = self::validate_parameters(self::create_module_parameters(), [
            'courseid'   => $courseid,
            'sectionnum' => $sectionnum,
            'moduletype' => $moduletype,
            'name'       => $name,
            'intro'      => $intro,
            'visible'    => $visible,
            'options'    => $options,
        ]);

        $allowedTypes = ['assign', 'quiz', 'forum', 'url', 'page'];
        if (!in_array($params['moduletype'], $allowedTypes)) {
            throw new \moodle_exception('error_module_type', 'local_kaggu', '', $params['moduletype']);
        }

        $course = self::check_license_and_capability($params['courseid']);

        // Parse options array → associative
        $opts = [];
        foreach ($params['options'] as $opt) {
            $opts[$opt['name']] = $opt['value'];
        }

        // Require module lib
        $modlibpath = $CFG->dirroot . '/mod/' . $params['moduletype'] . '/lib.php';
        if (!file_exists($modlibpath)) {
            throw new \moodle_exception('error_module_type', 'local_kaggu', '', $params['moduletype']);
        }
        require_once($modlibpath);

        // Get or create section record
        $section = $DB->get_record('course_sections', [
            'course'  => $params['courseid'],
            'section' => $params['sectionnum'],
        ]);
        if (!$section) {
            course_create_section($params['courseid'], $params['sectionnum'], true);
            $section = $DB->get_record('course_sections', [
                'course'  => $params['courseid'],
                'section' => $params['sectionnum'],
            ], '*', MUST_EXIST);
        }

        // Get module type record
        $module = $DB->get_record('modules', ['name' => $params['moduletype']], '*', MUST_EXIST);

        // In Moodle 5.x, context_module::instance(0) no longer works, so we must create
        // the course_modules record FIRST, then call {module}_add_instance() with the real context.

        // 1. Create placeholder course_modules record (instance=0)
        $cm = new \stdClass();
        $cm->course             = $params['courseid'];
        $cm->module             = $module->id;
        $cm->instance           = 0;
        $cm->section            = $section->id;
        $cm->visible            = $params['visible'];
        $cm->visibleold         = $params['visible'];
        $cm->cmidnumber         = '';
        $cm->groupmode          = 0;
        $cm->groupingid         = 0;
        $cm->completion         = 0;
        $cm->completionview     = 0;
        $cm->completionexpected = 0;
        $cm->showdescription    = 0;
        $cm->added              = time();
        $cmid = (int) $DB->insert_record('course_modules', $cm);

        // 2. Create real module context so {module}_add_instance() can use it
        \context_module::instance($cmid);

        // 3. Build module info for the instance
        $moduleinfo = new \stdClass();
        $moduleinfo->course      = $params['courseid'];
        $moduleinfo->coursemodule = $cmid;
        $moduleinfo->name        = $params['name'];
        $moduleinfo->intro       = $params['intro'] ?: '<p></p>';
        $moduleinfo->introformat = FORMAT_HTML;
        $moduleinfo->visible     = $params['visible'];

        // Module-specific fields
        self::apply_module_options($moduleinfo, $params['moduletype'], $opts);

        // 4. Call {module}_add_instance() — now context_module::instance() will resolve correctly
        $addfunc = $params['moduletype'] . '_add_instance';
        try {
            $instanceid = $addfunc($moduleinfo, null);
        } catch (\Exception $e) {
            $DB->delete_records('course_modules', ['id' => $cmid]);
            $trace = array_slice(explode("\n", $e->getTraceAsString()), 0, 5);
            throw new \moodle_exception('error_create_module', 'local_kaggu', '',
                $e->getMessage() . ' | in: ' . implode(' | ', $trace));
        }
        if (!$instanceid) {
            $DB->delete_records('course_modules', ['id' => $cmid]);
            throw new \moodle_exception('error_create_module', 'local_kaggu', '', 'Module instance creation failed');
        }

        // 5. Update CM record with real instance ID
        $DB->set_field('course_modules', 'instance', (int) $instanceid, ['id' => $cmid]);

        // 6. Add to section sequence
        $sequence = empty($section->sequence) ? [] : explode(',', $section->sequence);
        $sequence[] = $cmid;
        $DB->set_field('course_sections', 'sequence', implode(',', $sequence), ['id' => $section->id]);

        // 7. Rebuild course cache
        rebuild_course_cache($params['courseid'], true);

        return [
            'cmid'       => $cmid,
            'moduletype' => $params['moduletype'],
            'instanceid' => (int) $instanceid,
        ];
    }

    /**
     * Apply module-type-specific defaults and options to the moduleinfo object.
     */
    private static function apply_module_options(\stdClass $info, string $type, array $opts): void {
        switch ($type) {
            case 'assign':
                $info->submissiondrafts   = 0;
                $info->sendnotifications  = 0;
                $info->sendlatenotifications = 0;
                $info->allowsubmissionsfromdate = 0;
                $info->duedate            = (int)($opts['duedate'] ?? 0);
                $info->cutoffdate         = (int)($opts['cutoffdate'] ?? 0);
                $info->grade              = (int)($opts['maxgrade'] ?? 100);
                $info->gradingduedate     = 0;
                $info->requiresubmissionstatement = 0;
                $info->sendstudentnotifications   = 1;

                $subtype = $opts['submissiontype'] ?? 'online_text';
                $info->assignsubmission_onlinetext_enabled =
                    in_array($subtype, ['online_text', 'both']) ? 1 : 0;
                $info->assignsubmission_file_enabled =
                    in_array($subtype, ['file', 'both']) ? 1 : 0;
                $info->assignsubmission_file_maxfiles      = 1;
                $info->assignsubmission_file_maxsizebytes  = 0;
                $info->assignfeedback_comments_enabled     = 1;
                break;

            case 'quiz':
                $info->timeopen           = (int)($opts['timeopen'] ?? 0);
                $info->timeclose          = (int)($opts['timeclose'] ?? 0);
                $info->timelimit          = (int)($opts['timelimit'] ?? 0);
                $info->overduehandling    = 'autosubmit';
                $info->graceperiod        = 0;
                $info->attempts           = (int)($opts['attempts'] ?? 0);
                $info->grademethod        = (int)($opts['grademethod'] ?? 1);
                $info->shuffleanswers     = 1;
                $info->questionsperpage   = 1;
                $info->navmethod          = 'free';
                $info->preferredbehaviour = 'deferredfeedback';
                $info->decimalpoints      = 2;
                $info->questiondecimalpoints = -1;
                // Standard review bit flags
                $info->reviewattempt      = 69904;
                $info->reviewcorrectness  = 4368;
                $info->reviewmarks        = 4368;
                $info->reviewspecificfeedback  = 4368;
                $info->reviewgeneralfeedback   = 4368;
                $info->reviewrightanswer       = 4368;
                $info->reviewoverallfeedback   = 4368;
                break;

            case 'forum':
                $info->type           = $opts['type'] ?? 'general';
                $info->maxattachments = (int)($opts['maxattachments'] ?? 9);
                $info->maxbytes       = 0;
                $info->assessed       = 0;
                $info->displaywordcount    = 0;
                $info->completiondiscussions = 0;
                $info->completionreplies   = 0;
                $info->completionposts     = 0;
                break;

            case 'url':
                $info->externalurl    = $opts['externalurl'] ?? ($opts['url'] ?? '');
                $info->display        = (int)($opts['display'] ?? 0);
                $info->displayoptions = serialize(['popup' => 0, 'preindicator' => 0]);
                $info->parameters     = '';
                break;

            case 'page':
                $info->content        = $opts['content'] ?? '';
                $info->contentformat  = FORMAT_HTML;
                $info->legacyfiles    = 0;
                $info->display        = 5;
                $info->displayoptions = serialize(['printheading' => 0, 'printintro' => 0]);
                break;
        }
    }

    public static function create_module_returns(): \external_single_structure {
        return new \external_single_structure([
            'cmid'       => new \external_value(PARAM_INT, 'Course module ID'),
            'moduletype' => new \external_value(PARAM_TEXT, 'Module type'),
            'instanceid' => new \external_value(PARAM_INT, 'Module instance ID'),
        ]);
    }

    // ─── update_module ───────────────────────────────────────────────────────

    public static function update_module_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid'    => new \external_value(PARAM_INT,  'Course module ID'),
            'name'    => new \external_value(PARAM_TEXT, 'New name', VALUE_OPTIONAL),
            'intro'   => new \external_value(PARAM_RAW,  'New description', VALUE_OPTIONAL),
            'visible' => new \external_value(PARAM_INT,  'Visibility', VALUE_OPTIONAL),
            'options' => new \external_multiple_structure(
                new \external_single_structure([
                    'name'  => new \external_value(PARAM_ALPHANUMEXT, 'Option name'),
                    'value' => new \external_value(PARAM_RAW, 'Option value'),
                ]),
                'Module-specific options',
                VALUE_DEFAULT,
                []
            ),
        ]);
    }

    public static function update_module(int $cmid, ?string $name = null, ?string $intro = null, ?int $visible = null, array $options = []): array {
        global $DB, $CFG;

        $params = self::validate_parameters(self::update_module_parameters(), [
            'cmid'    => $cmid,
            'name'    => $name,
            'intro'   => $intro,
            'visible' => $visible,
            'options' => $options,
        ]);

        $cm = get_coursemodule_from_id('', $params['cmid'], 0, false, MUST_EXIST);
        self::check_license_and_capability($cm->course);

        // Get existing module info
        $course = get_course($cm->course);
        [$cm_info, $context, $cw, $cm_record, $data] = get_moduleinfo_data($cm, $course);

        // Apply updates
        if ($params['name'] !== null)    $data->name    = $params['name'];
        if ($params['intro'] !== null)   $data->intro   = $params['intro'];
        if ($params['visible'] !== null) $data->visible = $params['visible'];

        $opts = [];
        foreach ($params['options'] as $opt) {
            $opts[$opt['name']] = $opt['value'];
        }
        self::apply_module_options($data, $cm->modname, $opts);

        update_moduleinfo($cm_record, $data, $course);

        return ['success' => true];
    }

    public static function update_module_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Update successful'),
        ]);
    }

    // ─── delete_module ───────────────────────────────────────────────────────

    public static function delete_module_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Course module ID to delete'),
        ]);
    }

    public static function delete_module(int $cmid): array {
        $params = self::validate_parameters(self::delete_module_parameters(), ['cmid' => $cmid]);

        $cm = get_coursemodule_from_id('', $params['cmid'], 0, false, MUST_EXIST);
        self::check_license_and_capability($cm->course);

        course_delete_module($params['cmid']);

        return ['success' => true];
    }

    public static function delete_module_returns(): \external_single_structure {
        return new \external_single_structure([
            'success' => new \external_value(PARAM_BOOL, 'Deletion successful'),
        ]);
    }
}
