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
     * Directly write completion tracking and availability to course_modules.
     * update_moduleinfo / add_moduleinfo do not reliably persist these fields
     * when called outside the form context.
     */
    private static function apply_completion_to_cm(\moodle_database $DB, int $cmid, array $params): void {
        $update = new \stdClass();
        $update->id               = $cmid;
        $update->completion         = (int) ($params['completion']          ?? 0);
        $update->completionview     = (int) ($params['completionview']      ?? 0);
        $update->completionusegrade = (int) ($params['completionusegrade']  ?? 0);
        $update->completionpassgrade = (int) ($params['completionpassgrade'] ?? 0);
        $update->completionexpected  = (int) ($params['completionexpected']  ?? 0);
        $availability = $params['availability'] ?? '';
        $update->availability = ($availability !== '' && $availability !== null) ? $availability : null;
        $DB->update_record('course_modules', $update);
    }

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

    public static function ensure_section($courseid, $sectionnum, $name, $summary = ''): array {
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
            'courseid'            => new \external_value(PARAM_INT,  'Course ID'),
            'sectionnum'          => new \external_value(PARAM_INT,  'Section number (1-based)'),
            'moduletype'          => new \external_value(PARAM_ALPHANUMEXT, 'Module type (assign, quiz, forum, url, page)'),
            'name'                => new \external_value(PARAM_TEXT, 'Module name'),
            'intro'               => new \external_value(PARAM_RAW,  'Module description (HTML)', VALUE_DEFAULT, ''),
            'visible'             => new \external_value(PARAM_INT,  'Visibility (1=visible, 0=hidden)', VALUE_DEFAULT, 1),
            'completion'          => new \external_value(PARAM_INT,  'Completion tracking (0=none,1=manual,2=auto)', VALUE_DEFAULT, 0),
            'completionview'      => new \external_value(PARAM_INT,  'Must view to complete', VALUE_DEFAULT, 0),
            'completionusegrade'  => new \external_value(PARAM_INT,  'Must receive grade', VALUE_DEFAULT, 0),
            'completionpassgrade' => new \external_value(PARAM_INT,  'Must pass grade', VALUE_DEFAULT, 0),
            'completionexpected'  => new \external_value(PARAM_INT,  'Expected completion timestamp', VALUE_DEFAULT, 0),
            'availability'        => new \external_value(PARAM_RAW,  'Availability JSON', VALUE_DEFAULT, null),
            'options'             => new \external_multiple_structure(
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
        $courseid,
        $sectionnum,
        $moduletype,
        $name,
        $intro = '',
        $visible = 1,
        $completion = 0,
        $completionview = 0,
        $completionusegrade = 0,
        $completionpassgrade = 0,
        $completionexpected = 0,
        $availability = null,
        $options = []
    ): array {
        global $CFG, $DB;

        $params = self::validate_parameters(self::create_module_parameters(), [
            'courseid'            => $courseid,
            'sectionnum'          => $sectionnum,
            'moduletype'          => $moduletype,
            'name'                => $name,
            'intro'               => $intro,
            'visible'             => $visible,
            'completion'          => $completion,
            'completionview'      => $completionview,
            'completionusegrade'  => $completionusegrade,
            'completionpassgrade' => $completionpassgrade,
            'completionexpected'  => $completionexpected,
            'availability'        => $availability,
            'options'             => $options,
        ]);

        $allowedTypes = ['assign', 'quiz', 'forum', 'url', 'page', 'resource', 'book', 'h5pactivity', 'glossary', 'scorm', 'lesson', 'choice'];
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
        // Do NOT pass completion/availability to add_moduleinfo: Moodle validates
        // the availability JSON at construction time and throws a coding_exception
        // if a referenced module has completion=0 (even transiently during export).
        // apply_completion_to_cm() writes these fields directly after creation.
        $moduleinfo->completion          = 0;
        $moduleinfo->completionview      = 0;
        $moduleinfo->completionusegrade  = 0;
        $moduleinfo->completionpassgrade = 0;
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

            // add_moduleinfo does not reliably persist completion/availability fields.
            // Write them directly to course_modules to guarantee they are stored.
            self::apply_completion_to_cm($DB, $cmid, $params);
            rebuild_course_cache($params['courseid'], true);

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

            case 'resource':
                // Moodle 'resource' module = file resource
                // $opts['itemid'] is the draft area itemid from core_files_upload
                $info->tobemigrated    = 0;
                $info->legacyfiles     = 0;
                $info->legacyfileslast = null;
                $info->filterfiles     = 0;
                $info->revision        = 0;
                $info->display         = (int)($opts['display'] ?? 0);
                $info->displayoptions  = serialize([]);
                $info->files           = (int)($opts['itemid'] ?? 0);
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

            case 'book':
                $info->numbering    = (int)($opts['numbering'] ?? 1);
                $info->navstyle     = 1; // image buttons
                $info->customtitles = 0;
                break;

            case 'h5pactivity':
                $info->enabletracking  = (int)($opts['enabletracking'] ?? 1);
                $info->grademethod     = (int)($opts['grademethod']    ?? 1);
                $info->gradepass       = 0;
                $info->displayoptions  = 15; // show all UI elements
                break;

            case 'glossary':
                $info->globalglossary          = (int)($opts['globalglossary']  ?? 0);
                $info->mainglossary            = 0;
                $info->showspecial             = 1;
                $info->showalphabet            = 1;
                $info->showall                 = 1;
                $info->allowcomments           = (int)($opts['allowcomments']   ?? 0);
                $info->allowprintview          = 1;
                $info->usedynalink             = 1;
                $info->defaultapproval         = 1;
                $info->approvaldisplayformat   = $opts['displayformat'] ?? 'dictionary';
                $info->displayformat           = $opts['displayformat'] ?? 'dictionary';
                $info->entbypage               = 10;
                $info->editalways              = 0;
                $info->rsstype                 = 0;
                $info->rssarticles             = 0;
                $info->assessed                = 0;
                $info->scale                   = 0;
                $info->assesstimestart         = 0;
                $info->assesstimefinish        = 0;
                $info->completionentries       = 0;
                break;

            case 'scorm':
                $info->scormtype       = 'local';
                $info->maxattempt      = (int)($opts['maxattempt']  ?? 0);
                $info->grademethod     = (int)($opts['grademethod'] ?? 1);
                $info->whatgrade       = (int)($opts['whatgrade']   ?? 0);
                $info->maxgrade        = (int)($opts['maxgrade']    ?? 100);
                $info->forcecompleted  = 0;
                $info->forcenewattempt = 0;
                $info->lastattemptlock = 0;
                $info->displayattemptstatus = 1;
                $info->displaycoursestructure = 0;
                $info->skipview        = 1;
                $info->nav             = 1;
                $info->navpositionleft = -100;
                $info->navpositiontop  = -100;
                $info->auto            = 0;
                $info->popup           = 0;
                $info->width           = 100;
                $info->height          = 500;
                $info->updatefreq      = 0;
                break;

            case 'lesson':
                $info->maxattempts     = (int)($opts['maxattempts'] ?? 0);
                $info->timelimit       = (int)($opts['timelimit']   ?? 0);
                $info->retake          = (int)($opts['retake']      ?? 0);
                $info->review          = (int)($opts['review']      ?? 0);
                $info->grade           = 100;
                $info->custom          = 0;
                $info->ongoing         = 0;
                $info->usemaxgrade     = 0;
                $info->maxpages        = 0;
                $info->practice        = 0;
                $info->modattempts     = 0;
                $info->usepassword     = 0;
                $info->password        = '';
                $info->dependency      = 0;
                $info->conditions      = '';
                $info->activitylink    = 0;
                $info->available       = 0;
                $info->deadline        = 0;
                $info->slideshow       = 0;
                $info->width           = 640;
                $info->height          = 480;
                $info->bgcolor         = '#ffffff';
                $info->displayleft     = 0;
                $info->displayleftif   = 0;
                $info->progressbar     = 0;
                break;

            case 'choice':
                $info->allowupdate   = (int)($opts['allowupdate']  ?? 1);
                $info->showresults   = (int)($opts['showresults']  ?? 1);
                $info->display       = 0; // horizontal
                $info->publish       = 0;
                $info->allowmultiple = 0;
                $info->limitanswers  = 0;
                $info->timeopen      = 0;
                $info->timeclose     = 0;
                $info->showavailable = 0;
                $info->option       = ['Option 1', 'Option 2'];
                $info->limit        = [0, 0];
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
            'cmid'                => new \external_value(PARAM_INT,  'Course module ID'),
            'name'                => new \external_value(PARAM_TEXT, 'New name',                         VALUE_DEFAULT, ''),
            'intro'               => new \external_value(PARAM_RAW,  'New description',                  VALUE_DEFAULT, ''),
            'visible'             => new \external_value(PARAM_INT,  'Visibility',                       VALUE_DEFAULT, 1),
            'completion'          => new \external_value(PARAM_INT,  'Completion tracking',              VALUE_DEFAULT, 0),
            'completionview'      => new \external_value(PARAM_INT,  'Must view',                        VALUE_DEFAULT, 0),
            'completionusegrade'  => new \external_value(PARAM_INT,  'Must receive grade',               VALUE_DEFAULT, 0),
            'completionpassgrade' => new \external_value(PARAM_INT,  'Must pass grade',                  VALUE_DEFAULT, 0),
            'completionexpected'  => new \external_value(PARAM_INT,  'Expected completion timestamp',    VALUE_DEFAULT, 0),
            'availability'        => new \external_value(PARAM_RAW,  'Availability JSON (empty=no restr)', VALUE_DEFAULT, ''),
            'options'             => new \external_multiple_structure(
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

    public static function update_module(
        $cmid,
        $name = null,
        $intro = null,
        $visible = null,
        $completion = null,
        $completionview = null,
        $completionusegrade = null,
        $completionpassgrade = null,
        $completionexpected = null,
        $availability = null,
        $options = []
    ): array {
        global $DB, $CFG;

        $params = self::validate_parameters(self::update_module_parameters(), [
            'cmid'                => $cmid,
            'name'                => $name,
            'intro'               => $intro,
            'visible'             => $visible,
            'completion'          => $completion,
            'completionview'      => $completionview,
            'completionusegrade'  => $completionusegrade,
            'completionpassgrade' => $completionpassgrade,
            'completionexpected'  => $completionexpected,
            'availability'        => $availability,
            'options'             => $options,
        ]);

        $cm = get_coursemodule_from_id('', $params['cmid'], 0, false, MUST_EXIST);
        self::check_license_and_capability($cm->course);

        // Get existing module info
        $course = get_course($cm->course);
        [$cm_info, $context, $module, $data, $cw] = get_moduleinfo_data($cm, $course);

        // Apply updates (all params always present thanks to VALUE_DEFAULT)
        if ($params['name'] !== '')  $data->name = $params['name'];
        $data->intro              = $params['intro'];
        $data->visible            = (int) $params['visible'];
        // Do NOT pass completion/availability to update_moduleinfo for the same
        // reason as create_module: apply_completion_to_cm() handles these directly.
        $data->completion         = 0;
        $data->completionview     = 0;
        $data->completionusegrade = 0;
        $data->completionpassgrade = 0;
        $data->completionexpected  = 0;
        $data->availability        = null;

        $opts = [];
        foreach ($params['options'] as $opt) {
            $opts[$opt['name']] = $opt['value'];
        }
        if (!empty($opts)) {
            self::apply_module_options($data, $cm->modname, $opts);
        } else {
            // No opts provided — preserve module-specific fields that
            // update_moduleinfo / *_update_instance require but cannot
            // reconstruct from get_moduleinfo_data alone in Moodle 5.x.
            switch ($cm->modname) {
                case 'page':
                    // page_update_instance reads $data->page['text']/['format']
                    $content = $data->content ?? '';
                    $cfmt    = $data->contentformat ?? FORMAT_HTML;
                    $data->page = ['text' => $content, 'format' => $cfmt, 'itemid' => 0];
                    $data->displayoptions = serialize([
                        'printintro'        => (int)($data->printintro        ?? 0),
                        'printlastmodified' => (int)($data->printlastmodified ?? 1),
                    ]);
                    break;
                case 'quiz':
                    // quiz_update_instance maps quizpassword → password column
                    $data->quizpassword = $data->password ?? '';
                    break;
            }
        }

        update_moduleinfo($cm, $data, $course);

        // update_moduleinfo does not reliably persist completion/availability fields.
        // Write them directly to course_modules to guarantee they are stored.
        self::apply_completion_to_cm($DB, $cm->id, $params);
        rebuild_course_cache($cm->course, true);

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

    public static function delete_module($cmid): array {
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

    // ─── upload_file ─────────────────────────────────────────────────────────

    public static function upload_file_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'courseid'    => new \external_value(PARAM_INT,  'Course id (for capability check)'),
            'filename'    => new \external_value(PARAM_FILE, 'File name'),
            'filecontent' => new \external_value(PARAM_RAW,  'Base64-encoded file content'),
        ]);
    }

    public static function upload_file($courseid, $filename, $filecontent): array {
        global $USER;

        $params = self::validate_parameters(self::upload_file_parameters(), [
            'courseid'    => $courseid,
            'filename'    => $filename,
            'filecontent' => $filecontent,
        ]);

        self::check_license_and_capability($params['courseid']);

        // Create a new user draft area
        $draftitemid = file_get_unused_draft_itemid();
        $usercontext = \context_user::instance($USER->id);

        $fs = get_file_storage();
        $fileinfo = [
            'contextid' => $usercontext->id,
            'component' => 'user',
            'filearea'  => 'draft',
            'itemid'    => $draftitemid,
            'filepath'  => '/',
            'filename'  => $params['filename'],
        ];

        $decoded = base64_decode($params['filecontent'], true);
        if ($decoded === false) {
            throw new \moodle_exception('invalidbase64', 'local_kaggu', '', $params['filename']);
        }

        $fs->create_file_from_string($fileinfo, $decoded);

        return ['itemid' => $draftitemid];
    }

    public static function upload_file_returns(): \external_single_structure {
        return new \external_single_structure([
            'itemid' => new \external_value(PARAM_INT, 'Draft area item id to use with create_module'),
        ]);
    }
}
