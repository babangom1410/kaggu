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

        // Build module info
        $moduleinfo = new \stdClass();
        $moduleinfo->modulename     = $params['moduletype'];
        $moduleinfo->module         = $module->id; // required in Moodle 5.x
        $moduleinfo->course         = $params['courseid'];
        $moduleinfo->section        = $params['sectionnum'];
        $moduleinfo->name           = $params['name'];
        $moduleinfo->intro          = $params['intro'] ?: '<p></p>';
        $moduleinfo->introformat    = FORMAT_HTML;
        $moduleinfo->visible        = $params['visible'];
        $moduleinfo->visibleold     = $params['visible'];
        $moduleinfo->cmidnumber          = '';
        $moduleinfo->groupmode           = 0;
        $moduleinfo->groupingid          = 0;
        $moduleinfo->completion          = 0;
        $moduleinfo->completionview      = 0;
        $moduleinfo->completionexpected  = 0;
        $moduleinfo->availability        = null;
        $moduleinfo->showdescription     = 0;
        $moduleinfo->lang                = '';
        // Moodle 5.x new fields
        $moduleinfo->visibleoncoursepage = 1;
        $moduleinfo->downloadcontent     = 1;
        $moduleinfo->enabledaiactions    = null;

        // Module-specific fields
        self::apply_module_options($moduleinfo, $params['moduletype'], $opts);

        try {
            $moduleinfo = add_moduleinfo($moduleinfo, $course);
            $cmid = (int) ($moduleinfo->coursemodule ?? 0);
            if (!$cmid) {
                throw new \Exception('add_moduleinfo returned no coursemodule. Keys: ' . implode(',', array_keys((array)$moduleinfo)));
            }
            $cm = $DB->get_record('course_modules', ['id' => $cmid], 'instance', MUST_EXIST);
            return [
                'cmid'       => $cmid,
                'moduletype' => $params['moduletype'],
                'instanceid' => (int) $cm->instance,
            ];
        } catch (\Exception $e) {
            $trace = array_slice(explode("\n", $e->getTraceAsString()), 0, 4);
            throw new \moodle_exception('error_module_type', 'local_kaggu', '',
                get_class($e) . ': ' . $e->getMessage() . ' @ ' . implode(' @ ', $trace));
        }
    }

    /**
     * Apply module-type-specific defaults and options to the moduleinfo object.
     */
    private static function apply_module_options(\stdClass $info, string $type, array $opts): void {
        switch ($type) {
            case 'assign':
                // Core fields
                $info->nosubmissions                    = 0;
                $info->submissiondrafts                 = 0;
                $info->sendnotifications                = 0;
                $info->sendlatenotifications            = 0;
                $info->sendstudentnotifications         = 1;
                $info->allowsubmissionsfromdate         = 0;
                $info->alwaysshowdescription            = 1;
                $info->duedate                          = (int)($opts['duedate'] ?? 0);
                $info->cutoffdate                       = (int)($opts['cutoffdate'] ?? 0);
                $info->gradingduedate                   = 0;
                $info->grade                            = (int)($opts['maxgrade'] ?? 100);
                $info->requiresubmissionstatement       = 0;
                $info->completionsubmit                 = 0;
                // Team / workflow fields (Moodle 5.x non-nullable)
                $info->teamsubmission                   = 0;
                $info->requireallteammemberssubmit      = 0;
                $info->teamsubmissiongroupingid         = 0;
                $info->preventsubmissionnotingroup      = 0;
                $info->blindmarking                     = 0;
                $info->hidegrader                       = 0;
                $info->revealidentities                 = 0;
                $info->attemptreopenmethod              = 'none';
                $info->maxattempts                      = -1;
                $info->markingworkflow                  = 0;
                $info->markingallocation                = 0;
                // Submission plugins
                $subtype = $opts['submissiontype'] ?? 'online_text';
                $info->assignsubmission_onlinetext_enabled = in_array($subtype, ['online_text', 'both']) ? 1 : 0;
                $info->assignsubmission_file_enabled       = in_array($subtype, ['file', 'both']) ? 1 : 0;
                $info->assignsubmission_file_maxfiles      = 1;
                $info->assignsubmission_file_maxsizebytes  = 0;
                $info->assignfeedback_comments_enabled     = 1;
                break;

            case 'quiz':
                $info->timeopen              = (int)($opts['timeopen'] ?? 0);
                $info->timeclose             = (int)($opts['timeclose'] ?? 0);
                $info->timelimit             = (int)($opts['timelimit'] ?? 0);
                $info->overduehandling       = 'autosubmit';
                $info->graceperiod           = 0;
                $info->attempts              = (int)($opts['attempts'] ?? 0);
                $info->attemptonlast         = 0;
                $info->grademethod           = (int)($opts['grademethod'] ?? 1);
                $info->decimalpoints         = 2;
                $info->questiondecimalpoints = -1;
                $info->shuffleanswers        = 1;
                $info->questionsperpage      = 1;
                $info->navmethod             = 'free';
                $info->preferredbehaviour    = 'deferredfeedback';
                $info->canredoquestions      = 0;
                $info->sumgrades             = 0;
                $info->grade                 = 10;
                $info->showuserpicture       = 0;
                $info->showblocks            = 0;
                // Security (Moodle 5.x non-nullable)
                $info->quizpassword          = '';  // form field → mapped to 'password' column by quiz_add_instance()
                $info->password              = '';
                $info->subnet                = '';
                $info->browsersecurity       = '-';
                $info->delay1                = 0;
                $info->delay2                = 0;
                // Standard review bit flags
                $info->reviewattempt             = 69904;
                $info->reviewcorrectness         = 4368;
                $info->reviewmarks               = 4368;
                $info->reviewspecificfeedback    = 4368;
                $info->reviewgeneralfeedback     = 4368;
                $info->reviewrightanswer         = 4368;
                $info->reviewoverallfeedback     = 4368;
                break;

            case 'forum':
                $info->type               = $opts['type'] ?? 'general';
                $info->assessed           = 0;
                $info->assesstimestart    = 0;
                $info->assesstimefinish   = 0;
                $info->scale              = 0;
                $info->grade_forum        = 0;
                $info->grade_forum_notify = 0;
                $info->maxbytes           = 0;
                $info->maxattachments     = (int)($opts['maxattachments'] ?? 9);
                $info->forcesubscribe     = 0;  // 0=optional, 1=forced, 2=auto, 3=disabled
                $info->trackingtype       = 1;  // 1=optional
                $info->rsstype            = 0;
                $info->rssarticles        = 0;
                $info->warnafter          = 0;
                $info->blockafter         = 0;
                $info->blockperiod        = 0;
                $info->lockdiscussionafter = 0;
                $info->duedate            = 0;
                $info->cutoffdate         = 0;
                $info->displaywordcount   = 0;
                $info->completiondiscussions = 0;
                $info->completionreplies  = 0;
                $info->completionposts    = 0;
                break;

            case 'url':
                $info->externalurl    = $opts['externalurl'] ?? ($opts['url'] ?? '');
                $info->display        = (int)($opts['display'] ?? 0);
                $info->popupwidth     = 620;
                $info->popupheight    = 450;
                $info->preindicator   = 0;
                $info->parameters     = '';
                // displayoptions built by url_add_instance from the fields above
                $info->displayoptions = serialize([]);
                break;

            case 'page':
                $content = $opts['content'] ?? '';
                $info->content           = $content;
                $info->contentformat     = FORMAT_HTML;
                // Moodle 5.x: page_update_instance reads $data->page['text'] / ['format']
                $info->page              = ['text' => $content, 'format' => FORMAT_HTML, 'itemid' => 0];
                $info->printintro        = 0;
                $info->printlastmodified = 1;
                $info->legacyfiles       = 0;
                $info->revision          = 0;
                $info->display           = 5;
                $info->displayoptions    = serialize(['printintro' => 0, 'printlastmodified' => 1]);
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
        [$cm_info, $context, $module, $data, $cw] = get_moduleinfo_data($cm, $course);

        // Apply updates
        if ($params['name'] !== null)    $data->name    = $params['name'];
        if ($params['intro'] !== null)   $data->intro   = $params['intro'];
        if ($params['visible'] !== null) $data->visible = $params['visible'];

        $opts = [];
        foreach ($params['options'] as $opt) {
            $opts[$opt['name']] = $opt['value'];
        }
        self::apply_module_options($data, $cm->modname, $opts);

        update_moduleinfo($cm, $data, $course);

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
