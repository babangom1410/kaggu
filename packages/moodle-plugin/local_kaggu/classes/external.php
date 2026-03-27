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
                $intro = $opts['intro'] ?? '';
                $printintro = isset($opts['printintro']) ? (int)$opts['printintro'] : 0;
                $printlastmodified = isset($opts['printlastmodified']) ? (int)$opts['printlastmodified'] : 1;
                $info->intro             = $intro;
                $info->introformat       = FORMAT_HTML;
                // Moodle 5.x: page_update_instance reads $data->introeditor['text'] / ['format']
                $info->introeditor       = ['text' => $intro, 'format' => FORMAT_HTML, 'itemid' => 0];
                $info->showdescription   = (int)($opts['displaydescription'] ?? 0);
                $info->content           = $content;
                $info->contentformat     = FORMAT_HTML;
                // Moodle 5.x: page_update_instance reads $data->page['text'] / ['format']
                $info->page              = ['text' => $content, 'format' => FORMAT_HTML, 'itemid' => 0];
                $info->printintro        = $printintro;
                $info->printlastmodified = $printlastmodified;
                $info->legacyfiles       = 0;
                $info->revision          = 0;
                $info->display           = 5;
                $info->displayoptions    = serialize(['printintro' => $printintro, 'printlastmodified' => $printlastmodified]);
                break;

            case 'book':
                $info->numbering    = (int)($opts['numbering'] ?? 1);
                $info->navstyle     = 1; // image buttons
                $info->customtitles = 0;
                // Moodle 5.x: book_update_instance reads $data->introeditor
                $intro_val = $info->intro ?? '';
                $info->introeditor = ['text' => $intro_val, 'format' => FORMAT_HTML, 'itemid' => 0];
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
                    // page_update_instance reads $data->page['text']/['format'] and $data->introeditor['text']
                    $content = $data->content ?? '';
                    $cfmt    = $data->contentformat ?? FORMAT_HTML;
                    $data->page = ['text' => $content, 'format' => $cfmt, 'itemid' => 0];
                    $intro_val   = $data->intro ?? '';
                    $ifmt        = $data->introformat ?? FORMAT_HTML;
                    $data->introeditor = ['text' => $intro_val, 'format' => $ifmt, 'itemid' => 0];
                    $data->displayoptions = serialize([
                        'printintro'        => (int)($data->printintro        ?? 0),
                        'printlastmodified' => (int)($data->printlastmodified ?? 1),
                    ]);
                    break;
                case 'book':
                    $intro_val = $data->intro ?? '';
                    $data->introeditor = ['text' => $intro_val, 'format' => $data->introformat ?? FORMAT_HTML, 'itemid' => 0];
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

    // ─── find_course ─────────────────────────────────────────────────────────

    public static function find_course_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'ref' => new \external_value(PARAM_RAW, 'Numeric course ID or shortname'),
        ]);
    }

    public static function find_course(string $ref): array {
        global $DB;

        $params = self::validate_parameters(self::find_course_parameters(), ['ref' => $ref]);
        $ref = trim($params['ref']);

        $context = \context_system::instance();
        self::validate_context($context);

        $course = null;

        if (ctype_digit($ref)) {
            $course = $DB->get_record('course', ['id' => (int)$ref]);
        }

        if (!$course) {
            $course = $DB->get_record('course', ['shortname' => $ref]);
        }

        if (!$course) {
            $like = $DB->sql_like('fullname', ':q', false);
            $course = $DB->get_record_select('course', $like, ['q' => '%' . $DB->sql_like_escape($ref) . '%'], '*', IGNORE_MULTIPLE);
        }

        if (!$course || $course->id == SITEID) {
            return ['found' => false, 'id' => 0, 'fullname' => '', 'shortname' => '',
                    'categoryid' => 0, 'summary' => '', 'format' => '', 'startdate' => 0,
                    'enddate' => 0, 'visible' => 1];
        }

        return [
            'found'      => true,
            'id'         => (int) $course->id,
            'fullname'   => (string) $course->fullname,
            'shortname'  => (string) $course->shortname,
            'categoryid' => (int) $course->category,
            'summary'    => (string) $course->summary,
            'format'     => (string) $course->format,
            'startdate'  => (int) $course->startdate,
            'enddate'    => (int) $course->enddate,
            'visible'    => (int) $course->visible,
        ];
    }

    public static function find_course_returns(): \external_single_structure {
        return new \external_single_structure([
            'found'      => new \external_value(PARAM_BOOL, 'Whether the course was found'),
            'id'         => new \external_value(PARAM_INT,  'Course ID'),
            'fullname'   => new \external_value(PARAM_TEXT, 'Course full name'),
            'shortname'  => new \external_value(PARAM_TEXT, 'Course short name'),
            'categoryid' => new \external_value(PARAM_INT,  'Category ID'),
            'summary'    => new \external_value(PARAM_RAW,  'Course summary'),
            'format'     => new \external_value(PARAM_TEXT, 'Course format'),
            'startdate'  => new \external_value(PARAM_INT,  'Start date timestamp'),
            'enddate'    => new \external_value(PARAM_INT,  'End date timestamp'),
            'visible'    => new \external_value(PARAM_INT,  'Visible flag'),
        ]);
    }

    // ─── search_courses ───────────────────────────────────────────────────────

    public static function search_courses_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'query'   => new \external_value(PARAM_TEXT, 'Search query'),
            'perpage' => new \external_value(PARAM_INT,  'Max results', VALUE_DEFAULT, 20),
        ]);
    }

    public static function search_courses(string $query, int $perpage = 20): array {
        global $DB;

        $params = self::validate_parameters(self::search_courses_parameters(), [
            'query'   => $query,
            'perpage' => $perpage,
        ]);

        $context = \context_system::instance();
        self::validate_context($context);

        $q = trim($params['query']);
        if ($q === '') {
            return ['courses' => []];
        }

        $likeFullname  = $DB->sql_like('fullname',  ':q1', false);
        $likeShortname = $DB->sql_like('shortname', ':q2', false);
        $likeQuery = '%' . $DB->sql_like_escape($q) . '%';

        $sql = "SELECT id, fullname, shortname, category AS categoryid, summary, format, startdate, enddate, visible
                  FROM {course}
                 WHERE ($likeFullname OR $likeShortname)
                   AND id <> :siteid
                 ORDER BY fullname ASC";

        $rows = $DB->get_records_sql($sql, [
            'q1'     => $likeQuery,
            'q2'     => $likeQuery,
            'siteid' => SITEID,
        ], 0, $params['perpage']);

        $courses = [];
        foreach ($rows as $row) {
            $courses[] = [
                'id'        => (int) $row->id,
                'fullname'  => (string) $row->fullname,
                'shortname' => (string) $row->shortname,
            ];
        }

        return ['courses' => $courses];
    }

    // ─── update_book_chapters ─────────────────────────────────────────────────

    public static function update_book_chapters_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid'     => new \external_value(PARAM_INT, 'Course module ID of the book'),
            'chapters' => new \external_multiple_structure(
                new \external_single_structure([
                    'title'      => new \external_value(PARAM_TEXT, 'Chapter title'),
                    'content'    => new \external_value(PARAM_RAW,  'Chapter HTML content',   VALUE_DEFAULT, ''),
                    'subchapter' => new \external_value(PARAM_INT,  '0=chapter 1=subchapter', VALUE_DEFAULT, 0),
                    'hidden'     => new \external_value(PARAM_INT,  '0=visible 1=hidden',     VALUE_DEFAULT, 0),
                ])
            ),
        ]);
    }

    public static function update_book_chapters(int $cmid, array $chapters): array {
        global $DB;

        $params = self::validate_parameters(self::update_book_chapters_parameters(), [
            'cmid' => $cmid, 'chapters' => $chapters,
        ]);

        require_login();

        $cm = get_coursemodule_from_id('book', $params['cmid'], 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        $bookid = $cm->instance;

        // Replace all existing chapters
        $DB->delete_records('book_chapters', ['bookid' => $bookid]);

        $pagenum = 1;
        foreach ($params['chapters'] as $ch) {
            $record = new \stdClass();
            $record->bookid        = $bookid;
            $record->pagenum       = $pagenum++;
            $record->subchapter    = (int)$ch['subchapter'];
            $record->title         = $ch['title'];
            $record->content       = $ch['content'];
            $record->contentformat = FORMAT_HTML;
            $record->hidden        = (int)$ch['hidden'];
            $record->timecreated   = time();
            $record->timemodified  = time();
            $record->importsrc     = '';
            $DB->insert_record('book_chapters', $record);
        }

        // Increment revision so Moodle caches are invalidated
        $rev = (int)$DB->get_field('book', 'revision', ['id' => $bookid]);
        $DB->set_field('book', 'revision', $rev + 1, ['id' => $bookid]);

        return ['updated' => count($params['chapters'])];
    }

    public static function update_book_chapters_returns(): \external_single_structure {
        return new \external_single_structure([
            'updated' => new \external_value(PARAM_INT, 'Number of chapters saved'),
        ]);
    }

    // ─── create_quiz_content ─────────────────────────────────────────────────

    public static function create_quiz_content_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid'      => new \external_value(PARAM_INT, 'Quiz course module ID'),
            'questions' => new \external_multiple_structure(
                new \external_single_structure([
                    'type'            => new \external_value(PARAM_ALPHA, 'multichoice|truefalse|shortanswer|numerical'),
                    'text'            => new \external_value(PARAM_RAW,   'Question text (HTML)'),
                    'points'          => new \external_value(PARAM_FLOAT, 'Max mark',                        VALUE_DEFAULT, 1.0),
                    'generalfeedback' => new \external_value(PARAM_RAW,   'General feedback HTML',           VALUE_DEFAULT, ''),
                    'single'          => new \external_value(PARAM_INT,   '1=single correct (multichoice)', VALUE_DEFAULT, 1),
                    'answers'         => new \external_multiple_structure(
                        new \external_single_structure([
                            'text'     => new \external_value(PARAM_RAW,  'Answer text'),
                            'correct'  => new \external_value(PARAM_INT,  '1=correct'),
                            'feedback' => new \external_value(PARAM_RAW,  'Answer feedback', VALUE_DEFAULT, ''),
                        ]),
                        'Answers (multichoice or shortanswer)',
                        VALUE_DEFAULT, []
                    ),
                    'correct'       => new \external_value(PARAM_INT,   'Correct for truefalse (1=true)', VALUE_DEFAULT, 1),
                    'feedbacktrue'  => new \external_value(PARAM_RAW,   'Feedback when true',             VALUE_DEFAULT, ''),
                    'feedbackfalse' => new \external_value(PARAM_RAW,   'Feedback when false',            VALUE_DEFAULT, ''),
                    'answer'        => new \external_value(PARAM_FLOAT, 'Numerical answer',               VALUE_DEFAULT, 0),
                    'tolerance'     => new \external_value(PARAM_FLOAT, 'Numerical tolerance (±)',        VALUE_DEFAULT, 0),
                ])
            ),
        ]);
    }

    public static function create_quiz_content(int $cmid, array $questions): array {
        global $DB, $USER, $CFG;

        require_once($CFG->dirroot . '/mod/quiz/lib.php');

        $params = self::validate_parameters(self::create_quiz_content_parameters(), [
            'cmid' => $cmid, 'questions' => $questions,
        ]);

        require_login();
        $cm = get_coursemodule_from_id('quiz', $params['cmid'], 0, false, MUST_EXIST);
        $context = \context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        $quizid = $cm->instance;
        $coursecontext = \context_course::instance($cm->course);

        // ── Get or create a proper question category ──────────────────────────
        // Moodle 4.x+: questions must live in a sub-category (parent != 0).
        // The "top" category (parent = 0) is a container only — inserting
        // questions directly into it causes "Invalid context id" errors on
        // the quiz settings page because Moodle's question bank does not
        // resolve an editing context for top-level categories.

        // 1. Find (or create) the top category for this MODULE context.
        // Using module context ($context) instead of course context so each quiz
        // has its own isolated question category. This avoids "Invalid context id"
        // errors on the quiz settings page in Moodle 4.x+.
        $top = $DB->get_record('question_categories',
            ['contextid' => $context->id, 'parent' => 0],
            '*', IGNORE_MULTIPLE);

        if (!$top) {
            $top            = new \stdClass();
            $top->name      = 'top';
            $top->contextid = $context->id;
            $top->info      = '';
            $top->infoformat = FORMAT_HTML;
            $top->parent    = 0;
            $top->sortorder = 0;
            $top->stamp     = make_unique_id_code();
            $top->id = $DB->insert_record('question_categories', $top);
        }

        // 2. Find (or create) a default sub-category inside the top category.
        $category = $DB->get_record_select('question_categories',
            'contextid = :ctxid AND parent = :parent',
            ['ctxid' => $context->id, 'parent' => $top->id],
            '*', IGNORE_MULTIPLE);

        if (!$category) {
            $cat             = new \stdClass();
            $cat->name       = get_string('defaultfor', 'question', format_string($cm->name));
            $cat->contextid  = $context->id;
            $cat->info       = '';
            $cat->infoformat = FORMAT_HTML;
            $cat->parent     = $top->id;
            $cat->sortorder  = 999;
            $cat->stamp      = make_unique_id_code();
            $cat->id = $DB->insert_record('question_categories', $cat);
            $category = $cat;
        }

        // ── Delete existing slots + linked questions for this quiz ─────────────
        $existingSlots = $DB->get_records('quiz_slots', ['quizid' => $quizid]);
        foreach ($existingSlots as $slot) {
            $refs = $DB->get_records('question_references', [
                'component'    => 'mod_quiz',
                'questionarea' => 'slot',
                'itemid'       => $slot->id,
            ]);
            foreach ($refs as $ref) {
                $versions = $DB->get_records('question_versions', ['questionbankentryid' => $ref->questionbankentryid]);
                foreach ($versions as $ver) {
                    $q = $DB->get_record('question', ['id' => $ver->questionid]);
                    if ($q) {
                        self::delete_question_type_data($DB, $q->id, $q->qtype);
                        $DB->delete_records('question', ['id' => $q->id]);
                    }
                    $DB->delete_records('question_versions', ['id' => $ver->id]);
                }
                // Delete question_references BEFORE question_bank_entries (FK constraint).
                $DB->delete_records('question_references', ['id' => $ref->id]);
                $DB->delete_records('question_bank_entries', ['id' => $ref->questionbankentryid]);
            }
        }
        $DB->delete_records('quiz_slots', ['quizid' => $quizid]);

        // ── Create new questions ───────────────────────────────────────────────
        $now       = time();
        $slotNum   = 1;
        $sumgrades = 0.0;

        foreach ($params['questions'] as $qdata) {
            $qtype  = $qdata['type'];
            $points = (float)($qdata['points'] ?? 1.0);
            $sumgrades += $points;

            // 1. question record
            $q = new \stdClass();
            $q->category            = $category->id;
            $q->parent              = 0;
            $q->name                = \core_text::substr(strip_tags($qdata['text']), 0, 250) ?: "Question $slotNum";
            $q->questiontext        = $qdata['text'];
            $q->questiontextformat  = FORMAT_HTML;
            $q->generalfeedback     = $qdata['generalfeedback'] ?? '';
            $q->generalfeedbackformat = FORMAT_HTML;
            $q->defaultmark         = $points;
            $q->penalty             = 0.3333333;
            $q->qtype               = $qtype;
            $q->length              = 1;
            $q->stamp               = make_unique_id_code();
            $q->timecreated         = $now;
            $q->timemodified        = $now;
            $q->createdby           = $USER->id;
            $q->modifiedby          = $USER->id;
            $q->id = $DB->insert_record('question', $q);

            // 2. question_bank_entries
            $entry = new \stdClass();
            $entry->questioncategoryid = $category->id;
            $entry->idnumber           = null;
            $entry->ownerid            = $USER->id;
            $entry->hidden             = 0;
            $entry->id = $DB->insert_record('question_bank_entries', $entry);

            // 3. question_versions
            $ver = new \stdClass();
            $ver->questionbankentryid = $entry->id;
            $ver->version             = 1;
            $ver->questionid          = $q->id;
            $ver->status              = 'ready';
            $DB->insert_record('question_versions', $ver);

            // 4. type-specific data
            self::create_question_type_data($DB, $q->id, $qtype, $qdata);

            // 5. quiz_slots
            $slot = new \stdClass();
            $slot->quizid          = $quizid;
            $slot->slot            = $slotNum;
            $slot->page            = $slotNum;
            $slot->requireprevious = 0;
            $slot->maxmark         = $points;
            $slot->id = $DB->insert_record('quiz_slots', $slot);

            // 6. question_references (Moodle 4.0+ linking mechanism)
            $ref = new \stdClass();
            $ref->usingcontextid    = $context->id;
            $ref->component         = 'mod_quiz';
            $ref->questionarea      = 'slot';
            $ref->itemid            = $slot->id;
            $ref->questionbankentryid = $entry->id;
            $ref->version           = null; // null = always latest
            $DB->insert_record('question_references', $ref);

            $slotNum++;
        }

        // ── Update quiz sumgrades and grade ────────────────────────────────────
        $DB->set_field('quiz', 'sumgrades', $sumgrades, ['id' => $quizid]);
        $DB->set_field('quiz', 'grade',     $sumgrades > 0 ? $sumgrades : 10, ['id' => $quizid]);

        try {
            $quizrecord = $DB->get_record('quiz', ['id' => $quizid]);
            quiz_update_grades($quizrecord);
        } catch (\Throwable $e) {
            // Non-fatal: grade update may fail if no attempts exist yet
        }

        rebuild_course_cache($cm->course, true);

        return ['created' => count($params['questions'])];
    }

    private static function create_question_type_data(\moodle_database $DB, int $qid, string $qtype, array $qdata): void {
        switch ($qtype) {
            case 'multichoice':
                $single = (int)($qdata['single'] ?? 1);
                $opts = new \stdClass();
                $opts->questionid                        = $qid;
                $opts->layout                            = 0;
                $opts->single                            = $single;
                $opts->shuffleanswers                    = 1;
                $opts->correctfeedback                   = '';
                $opts->correctfeedbackformat             = FORMAT_HTML;
                $opts->partiallycorrectfeedback          = '';
                $opts->partiallycorrectfeedbackformat    = FORMAT_HTML;
                $opts->incorrectfeedback                 = '';
                $opts->incorrectfeedbackformat           = FORMAT_HTML;
                $opts->answernumbering                   = 'abc';
                $opts->showstandardinstruction           = 0;
                $DB->insert_record('qtype_multichoice_options', $opts);

                $answers = $qdata['answers'] ?? [];
                $nCorrect = max(1, count(array_filter($answers, fn($a) => (int)($a['correct'] ?? 0) === 1)));
                foreach ($answers as $ans) {
                    $a = new \stdClass();
                    $a->question       = $qid;
                    $a->answer         = $ans['text'];
                    $a->answerformat   = FORMAT_HTML;
                    $a->feedback       = $ans['feedback'] ?? '';
                    $a->feedbackformat = FORMAT_HTML;
                    $a->fraction       = (int)($ans['correct'] ?? 0) === 1
                        ? ($single ? 1.0 : round(1.0 / $nCorrect, 7))
                        : 0.0;
                    $DB->insert_record('question_answers', $a);
                }
                break;

            case 'truefalse':
                $trueA = new \stdClass();
                $trueA->question       = $qid;
                $trueA->answer         = 'True';
                $trueA->answerformat   = FORMAT_MOODLE;
                $trueA->fraction       = (int)($qdata['correct'] ?? 1) === 1 ? 1.0 : 0.0;
                $trueA->feedback       = $qdata['feedbacktrue'] ?? '';
                $trueA->feedbackformat = FORMAT_HTML;
                $trueId = $DB->insert_record('question_answers', $trueA);

                $falseA = new \stdClass();
                $falseA->question       = $qid;
                $falseA->answer         = 'False';
                $falseA->answerformat   = FORMAT_MOODLE;
                $falseA->fraction       = (int)($qdata['correct'] ?? 1) === 1 ? 0.0 : 1.0;
                $falseA->feedback       = $qdata['feedbackfalse'] ?? '';
                $falseA->feedbackformat = FORMAT_HTML;
                $falseId = $DB->insert_record('question_answers', $falseA);

                $tf = new \stdClass();
                $tf->question    = $qid;
                $tf->trueanswer  = $trueId;
                $tf->falseanswer = $falseId;
                $DB->insert_record('question_truefalse', $tf);
                break;

            case 'shortanswer':
                $shopts = new \stdClass();
                $shopts->questionid = $qid;
                $shopts->usecase    = 0;
                $DB->insert_record('qtype_shortanswer_options', $shopts);

                $first = true;
                foreach ($qdata['answers'] ?? [] as $ans) {
                    $a = new \stdClass();
                    $a->question       = $qid;
                    $a->answer         = $ans['text'];
                    $a->answerformat   = FORMAT_MOODLE;
                    $a->fraction       = $first ? 1.0 : 0.5;
                    $a->feedback       = $ans['feedback'] ?? '';
                    $a->feedbackformat = FORMAT_HTML;
                    $DB->insert_record('question_answers', $a);
                    $first = false;
                }
                break;

            case 'numerical':
                $a = new \stdClass();
                $a->question       = $qid;
                $a->answer         = (string)($qdata['answer'] ?? 0);
                $a->answerformat   = FORMAT_MOODLE;
                $a->fraction       = 1.0;
                $a->feedback       = '';
                $a->feedbackformat = FORMAT_HTML;
                $ansId = $DB->insert_record('question_answers', $a);

                $num = new \stdClass();
                $num->question  = $qid;
                $num->answer    = $ansId;
                $num->tolerance = (float)($qdata['tolerance'] ?? 0);
                $DB->insert_record('question_numerical', $num);

                $numopts = new \stdClass();
                $numopts->question        = $qid;
                $numopts->showunits       = 0;
                $numopts->unitsleft       = 0;
                $numopts->unitgradingtype = 0;
                $numopts->unitpenalty     = 0.1;
                $DB->insert_record('question_numerical_options', $numopts);
                break;
        }
    }

    private static function delete_question_type_data(\moodle_database $DB, int $qid, string $qtype): void {
        $DB->delete_records('question_answers', ['question' => $qid]);
        switch ($qtype) {
            case 'multichoice':
                $DB->delete_records('qtype_multichoice_options', ['questionid' => $qid]);
                break;
            case 'truefalse':
                $DB->delete_records('question_truefalse', ['question' => $qid]);
                break;
            case 'shortanswer':
                $DB->delete_records('qtype_shortanswer_options', ['questionid' => $qid]);
                break;
            case 'numerical':
                $DB->delete_records('question_numerical',         ['question' => $qid]);
                $DB->delete_records('question_numerical_options', ['question' => $qid]);
                break;
        }
    }

    public static function create_quiz_content_returns(): \external_single_structure {
        return new \external_single_structure([
            'created' => new \external_value(PARAM_INT, 'Number of questions created'),
        ]);
    }

    // ─── get_book_chapters ───────────────────────────────────────────────────

    public static function get_book_chapters_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Book course module ID'),
        ]);
    }

    public static function get_book_chapters(int $cmid): array {
        global $DB;

        require_login();
        $cm = get_coursemodule_from_id('book', $cmid, 0, false, IGNORE_MISSING);
        if (!$cm) {
            return ['chapters' => []];
        }
        $context = \context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/book:read', $context);

        $chapters = $DB->get_records('book_chapters',
            ['bookid' => $cm->instance, 'hidden' => 0],
            'pagenum ASC'
        );

        $result = [];
        foreach ($chapters as $chapter) {
            $result[] = [
                'id'            => (int)$chapter->id,
                'title'         => (string)$chapter->title,
                'content'       => (string)$chapter->content,
                'contentformat' => (int)$chapter->contentformat,
                'pagenum'       => (int)$chapter->pagenum,
                'subchapter'    => (int)$chapter->subchapter,
            ];
        }

        return ['chapters' => $result];
    }

    public static function get_book_chapters_returns(): \external_single_structure {
        return new \external_single_structure([
            'chapters' => new \external_multiple_structure(
                new \external_single_structure([
                    'id'            => new \external_value(PARAM_INT,  'Chapter ID'),
                    'title'         => new \external_value(PARAM_TEXT, 'Chapter title'),
                    'content'       => new \external_value(PARAM_RAW,  'Chapter content HTML'),
                    'contentformat' => new \external_value(PARAM_INT,  'Content format'),
                    'pagenum'       => new \external_value(PARAM_INT,  'Page number'),
                    'subchapter'    => new \external_value(PARAM_INT,  '1 if subchapter'),
                ])
            ),
        ]);
    }

    // ─── get_quiz_questions ──────────────────────────────────────────────────

    public static function get_quiz_questions_parameters(): \external_function_parameters {
        return new \external_function_parameters([
            'cmid' => new \external_value(PARAM_INT, 'Quiz course module ID'),
        ]);
    }

    public static function get_quiz_questions(int $cmid): array {
        global $DB;

        require_login();
        $cm = get_coursemodule_from_id('quiz', $cmid, 0, false, IGNORE_MISSING);
        if (!$cm) {
            return ['questions' => []];
        }
        $context = \context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('mod/quiz:view', $context);

        $quizid = $cm->instance;
        $slots  = $DB->get_records('quiz_slots', ['quizid' => $quizid], 'slot ASC');

        $questions = [];
        foreach ($slots as $slot) {
            $refs = $DB->get_records('question_references', [
                'component'    => 'mod_quiz',
                'questionarea' => 'slot',
                'itemid'       => $slot->id,
            ]);
            foreach ($refs as $ref) {
                // Get the latest version of the question
                $versions = $DB->get_records('question_versions',
                    ['questionbankentryid' => $ref->questionbankentryid],
                    'version DESC', '*', 0, 1
                );
                $ver = reset($versions);
                if (!$ver) continue;

                $q = $DB->get_record('question', ['id' => $ver->questionid]);
                if (!$q) continue;

                $qdata = [
                    'type'            => $q->qtype,
                    'text'            => $q->questiontext,
                    'points'          => (float)$q->defaultmark,
                    'generalfeedback' => (string)($q->generalfeedback ?? ''),
                    // type-specific fields (empty defaults)
                    'single'          => 1,
                    'answers'         => [],
                    'correct'         => 1,
                    'feedbacktrue'    => '',
                    'feedbackfalse'   => '',
                    'answer'          => 0.0,
                    'tolerance'       => 0.0,
                ];

                switch ($q->qtype) {
                    case 'multichoice':
                        $opts = $DB->get_record('qtype_multichoice_options', ['questionid' => $q->id]);
                        $qdata['single'] = $opts ? (int)$opts->single : 1;
                        $dbAnswers = $DB->get_records('question_answers', ['question' => $q->id]);
                        foreach ($dbAnswers as $ans) {
                            $qdata['answers'][] = [
                                'text'     => (string)$ans->answer,
                                'correct'  => $ans->fraction > 0 ? 1 : 0,
                                'feedback' => (string)($ans->feedback ?? ''),
                            ];
                        }
                        break;

                    case 'truefalse':
                        $tf = $DB->get_record('question_truefalse', ['question' => $q->id]);
                        if ($tf) {
                            $trueAns  = $DB->get_record('question_answers', ['id' => $tf->trueanswer]);
                            $falseAns = $DB->get_record('question_answers', ['id' => $tf->falseanswer]);
                            $qdata['correct']       = $trueAns && $trueAns->fraction > 0 ? 1 : 0;
                            $qdata['feedbacktrue']  = (string)($trueAns->feedback  ?? '');
                            $qdata['feedbackfalse'] = (string)($falseAns->feedback ?? '');
                        }
                        break;

                    case 'shortanswer':
                        $dbAnswers = $DB->get_records('question_answers', ['question' => $q->id]);
                        foreach ($dbAnswers as $ans) {
                            $qdata['answers'][] = [
                                'text'     => (string)$ans->answer,
                                'correct'  => $ans->fraction > 0 ? 1 : 0,
                                'feedback' => (string)($ans->feedback ?? ''),
                            ];
                        }
                        break;

                    case 'numerical':
                        $num = $DB->get_record('question_numerical', ['question' => $q->id]);
                        if ($num) {
                            $ans = $DB->get_record('question_answers', ['id' => $num->answer]);
                            $qdata['answer']    = $ans ? (float)$ans->answer : 0.0;
                            $qdata['tolerance'] = (float)$num->tolerance;
                        }
                        break;
                }

                $questions[] = $qdata;
            }
        }

        return ['questions' => $questions];
    }

    public static function get_quiz_questions_returns(): \external_single_structure {
        return new \external_single_structure([
            'questions' => new \external_multiple_structure(
                new \external_single_structure([
                    'type'            => new \external_value(PARAM_ALPHA, 'Question type'),
                    'text'            => new \external_value(PARAM_RAW,   'Question text HTML'),
                    'points'          => new \external_value(PARAM_FLOAT, 'Max mark'),
                    'generalfeedback' => new \external_value(PARAM_RAW,   'General feedback'),
                    'single'          => new \external_value(PARAM_INT,   '1=single answer (multichoice)', VALUE_DEFAULT, 1),
                    'answers'         => new \external_multiple_structure(
                        new \external_single_structure([
                            'text'     => new \external_value(PARAM_RAW, 'Answer text'),
                            'correct'  => new \external_value(PARAM_INT, '1=correct'),
                            'feedback' => new \external_value(PARAM_RAW, 'Answer feedback', VALUE_DEFAULT, ''),
                        ]),
                        'Answers', VALUE_DEFAULT, []
                    ),
                    'correct'         => new \external_value(PARAM_INT,   'Correct for truefalse (1=true)', VALUE_DEFAULT, 1),
                    'feedbacktrue'    => new \external_value(PARAM_RAW,   'Feedback when true',             VALUE_DEFAULT, ''),
                    'feedbackfalse'   => new \external_value(PARAM_RAW,   'Feedback when false',            VALUE_DEFAULT, ''),
                    'answer'          => new \external_value(PARAM_FLOAT, 'Numerical answer',               VALUE_DEFAULT, 0),
                    'tolerance'       => new \external_value(PARAM_FLOAT, 'Numerical tolerance',            VALUE_DEFAULT, 0),
                ])
            ),
        ]);
    }

    // ─── search_courses ───────────────────────────────────────────────────────

    public static function search_courses_returns(): \external_single_structure {
        return new \external_single_structure([
            'courses' => new \external_multiple_structure(
                new \external_single_structure([
                    'id'        => new \external_value(PARAM_INT,  'Course ID'),
                    'fullname'  => new \external_value(PARAM_TEXT, 'Full name'),
                    'shortname' => new \external_value(PARAM_TEXT, 'Short name'),
                ])
            ),
        ]);
    }
}
