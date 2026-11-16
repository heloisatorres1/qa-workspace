// Fictional demo data. Every project, person, link and bug here is invented.
import type {
  AuditEvent,
  Build,
  CaseRevision,
  DeliveryJob,
  Finding,
  Person,
  Platform,
  Priority,
  Project,
  Release,
  ResourceLink,
  ResultAttempt,
  ResultValue,
  Route,
  Run,
  Session,
  Severity,
  Suite,
  TestCase,
} from '../domain/types';
import { noFaults, type MockRemote, type RemoteMessage } from '../integrations/mock';
import type { RemoteTask } from '../integrations/types';
import { createRun } from '../domain/runs';
import type { AppState } from './state';
import { DEFAULT_STATUS_MAPPING } from '../domain/digest';

export const ME = 'u-lead';

export function seed(nowDate: Date = new Date()): AppState {
  const now = nowDate.getTime();
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();

  const projects: Project[] = [
    { id: 'og', name: 'Orbit Garden', key: 'OG' },
    { id: 'tt', name: 'Tidepool Tactics', key: 'TT' },
  ];
  const builds: Build[] = [
    { id: 'og-083', projectId: 'og', version: '0.8.3', createdAt: ago(60 * 24 * 9) },
    { id: 'og-084', projectId: 'og', version: '0.8.4', label: 'Hotfix', createdAt: ago(62) },
    { id: 'tt-120', projectId: 'tt', version: '1.2.0', createdAt: ago(60 * 24 * 3) },
  ];
  const people: Person[] = [
    { id: ME, name: 'Demo Lead', role: 'lead' },
    { id: 'u-alex', name: 'Alex R.', role: 'tester' },
    { id: 'u-sam', name: 'Sam K.', role: 'tester' },
    { id: 'u-jamie', name: 'Jamie P.', role: 'tester' },
    { id: 'u-taylor', name: 'Taylor M.', role: 'tester' },
    { id: 'u-riley', name: 'Riley C.', role: 'tester' },
    { id: 'u-morgan', name: 'Morgan D.', role: 'viewer' },
  ];

  // ---- Bugs -----------------------------------------------------------------
  type B = [number, string, Severity, Priority, string, Platform, Finding['status']?];
  const ogBugs: B[] = [
    [104, 'Player gets stuck in greenhouse after reconnect', 'critical', 'P1', 'u-alex', 'Android', 'in_progress'],
    [109, 'Save data rolls back after resuming an offline session', 'critical', 'P1', 'u-sam', 'PC'],
    [112, 'Crop growth timer stops after sleep (doesn’t resume)', 'high', 'P2', 'u-sam', 'Android', 'in_progress'],
    [115, 'Quest log keeps a completed delivery quest active', 'high', 'P2', 'u-jamie', 'PC'],
    [118, 'Shop purchase charges seeds twice on a slow network', 'high', 'P1', 'u-alex', 'Android'],
    [121, 'Fast-travel button unresponsive after a cutscene', 'high', 'P2', 'u-taylor', 'Switch'],
    [124, 'Watering can upgrade not applied after relaunch', 'high', 'P2', 'u-morgan', 'iOS'],
    [127, 'Tooltip shows incorrect seed cost in shop', 'medium', 'P3', 'u-jamie', 'PC'],
    [130, 'Dialogue portrait flickers on scene change', 'medium', 'P3', 'u-taylor', 'Switch'],
    [133, 'Festival banner overlaps the settings button at 4:3', 'medium', 'P3', 'u-riley', 'PC'],
    [136, 'Greenhouse fog VFX renders above the UI', 'medium', 'P2', 'u-taylor', 'Android'],
    [139, 'Portuguese (BR) text truncated on harvest summary', 'medium', 'P3', 'u-jamie', 'iOS'],
    [142, 'Controller focus skips the “Sell all” button', 'medium', 'P3', 'u-riley', 'Switch'],
    [145, 'Rain particles stop after changing graphics preset', 'medium', 'P3', 'u-taylor', 'PC'],
    [148, 'Pet follows the player through closed fences', 'medium', 'P4', 'u-morgan', 'Android'],
    [151, 'Achievement toast shows twice for “First bloom”', 'medium', 'P3', 'u-alex', 'PC'],
    [154, 'Music crossfade restarts the track when entering the village', 'medium', 'P4', 'u-sam', 'iOS'],
    [157, 'Ambient audio keeps playing on pause menu', 'low', 'P3', 'u-taylor', 'Android'],
    [160, 'Credits list scrolls past the last name', 'low', 'P4', 'u-jamie', 'PC'],
    [163, 'Settings slider label misaligned by 2px', 'low', 'P4', 'u-riley', 'PC'],
    [166, 'Typo in the beekeeper’s greeting', 'low', 'P4', 'u-jamie', 'Switch'],
    [169, 'Inventory sort icon uses the old style', 'low', 'P4', 'u-riley', 'iOS'],
    [172, 'Bench sitting animation clips into the backrest', 'low', 'P4', 'u-morgan', 'PC'],
    [175, 'Loading tip repeats twice in a row', 'low', 'P4', 'u-taylor', 'Android'],
    [101, 'Seeds disappear when the bag is full', 'high', 'P2', 'u-alex', 'Android', 'resolved'],
    [102, 'Crash when opening the map on first launch', 'critical', 'P1', 'u-sam', 'iOS', 'closed'],
    [106, 'Greenhouse door won’t open after a network drop', 'critical', 'P1', 'u-riley', 'Android', 'closed'],
  ];
  const ttBugs: B[] = [
    [180, 'Unit selection lost after undo', 'high', 'P2', 'u-riley', 'PC'],
    [181, 'Tide timer shows negative seconds', 'medium', 'P3', 'u-jamie', 'PC'],
  ];

  const stepsFor = (title: string) =>
    title.includes('reconnect')
      ? '1. Load a save and walk into the greenhouse.\n2. Turn network off for 10 seconds, then back on.\n3. Try to walk out of the greenhouse.'
      : '1. Load the “QA midgame” save.\n2. Reach the area described in the title.\n3. Perform the action once and observe.';

  const bug = ([n, title, severity, priority, owner, platform, status]: B, projectId: string, i: number): Finding => {
    const created = ago(60 * 24 * 6 - i * 150);
    return {
      id: `CP-${n}`,
      type: 'bug',
      projectId,
      buildId: projectId === 'og' ? (n < 110 ? 'og-083' : 'og-084') : 'tt-120',
      title,
      status: status ?? 'open',
      reporterId: i % 2 ? 'u-alex' : ME,
      ownerId: owner,
      createdAt: created,
      updatedAt: created,
      description: '',
      steps: stepsFor(title),
      expected: 'The game behaves as designed with no visible issue.',
      actual: title + '.',
      severity,
      priority,
      platform,
      device: platform === 'Android' ? 'Pixel 7 · Android 14' : platform === 'iOS' ? 'iPhone 13 · iOS 17' : platform === 'PC' ? 'Windows 11 · GTX 1660' : 'Retail unit',
      attachments: n === 104 ? [{ id: 'att-1', name: 'greenhouse-reconnect.mp4', type: 'video/mp4', size: 14_200_000 }] : [],
      sessionId: n === 104 || n === 118 ? 'ses-android' : undefined,
      external: {
        provider: 'tracker',
        externalId: `TSK-${3000 + n}`,
        url: `https://tracker.example.com/t/TSK-${3000 + n}`,
        syncedAt: ago(7),
      },
    };
  };
  const findings: Finding[] = [...ogBugs.map((b, i) => bug(b, 'og', i)), ...ttBugs.map((b, i) => bug(b, 'tt', i))];
  findings.find((f) => f.id === 'CP-106')!.duplicateOf = 'CP-104';
  findings.find((f) => f.id === 'CP-104')!.description = 'Happens on every reconnect while inside the greenhouse; the exit trigger stops responding.';
  findings.find((f) => f.id === 'CP-104')!.runResultRef = { runId: 'run-smoke', caseId: 'save-3' };

  const fb = (n: number, title: string, observation: string, suggestion: string, category: string, min: number): Finding => ({
    id: `CP-${n}`,
    type: 'feedback',
    projectId: 'og',
    buildId: 'og-084',
    title,
    observation,
    suggestion,
    category,
    status: 'open',
    reporterId: 'u-jamie',
    createdAt: ago(min),
    updatedAt: ago(min),
  });
  findings.push(
    fb(184, 'Harvest summary is hard to read at a glance', 'Totals and bonuses use the same weight, so the final number is easy to miss.', 'Make the total larger and group bonuses under it.', 'UX', 300),
    fb(185, 'Tutorial never explains compost', 'Compost bins appear in day 3 with no hint about what they do.', 'Add a one-line tip when the first bin unlocks.', 'Onboarding', 800),
    fb(186, 'New rain ambience feels great', 'Rain layering in 0.8.4 makes evenings feel calmer.', '', 'Audio', 1300),
  );

  const q = (n: number, title: string, question: string, owner: string, min: number, answer?: string, projectId = 'og'): Finding => ({
    id: `CP-${n}`,
    type: 'question',
    projectId,
    buildId: projectId === 'og' ? 'og-084' : 'tt-120',
    title,
    question,
    ownerId: owner,
    status: answer ? 'resolved' : 'open',
    answer,
    answeredAt: answer ? ago(37) : undefined,
    reporterId: ME,
    createdAt: ago(min),
    updatedAt: answer ? ago(37) : ago(min),
  });
  findings.push(
    q(187, 'Should crops keep growing while the game is closed?', 'Design doc says “real time” but the build pauses growth when closed. Which one is intended?', 'u-morgan', 200),
    q(188, 'Does the 0.8.4 hotfix include the double-charge shop fix?', 'CP-118 is not in the hotfix notes. Should QA verify it in this build?', 'u-alex', 95),
    q(189, 'Which Android devices are in scope for the reconnect sweep?', 'Should we include Android 12 devices or only 13+?', 'u-sam', 400),
    q(190, 'Should achievement toasts queue or replace each other?', 'Two toasts at once currently overlap. What is the intended behavior?', 'u-taylor', 600),
    q(191, 'Is the crop timer fix planned for 0.8.5?', 'Asking for the release notes draft (CP-112).', 'u-sam', 900, 'Yes. A fix is in progress for 0.8.5.'),
    q(192, 'Is undo limited to one step?', 'Need to know before writing undo test cases.', 'u-riley', 2000, 'Three steps, per the current design.', 'tt'),
  );

  // ---- Test Lab -------------------------------------------------------------
  const suiteDefs: [string, string, string, string[]][] = [
    ['garden', 'Garden & harvest', 'Planting, growth and harvest loops.', ['Plant a seed on tilled soil', 'Water a planted tile', 'Harvest a fully grown crop', 'Crop growth continues after sleeping', 'Fertilizer increases yield', 'Greenhouse door opens and closes', 'Seasonal crop wilts out of season', 'Scarecrow protects nearby tiles']],
    ['inventory', 'Inventory & shop', 'Bag, sorting and trading.', ['Pick up an item with space in the bag', 'Pick up an item with a full bag', 'Sort inventory by type', 'Sell one item at the shop', 'Sell all items at the shop', 'Seed cost tooltip matches shop price', 'Purchase with insufficient coins', 'Inventory stays open after reconnect']],
    ['save', 'Save & reconnect', 'Persistence, offline play and session recovery.', ['Autosave triggers at end of day', 'Manual save from pause menu', 'Load the most recent save', 'Resume after network drop mid-harvest', 'Resume after app is backgrounded', 'Offline progress syncs on reconnect', 'Corrupted save shows recovery prompt', 'Cloud save conflict resolution']],
    ['progression', 'Progression & quests', 'Quests, unlocks, upgrades and events.', ['Accept a delivery quest', 'Complete a delivery quest', 'Quest log updates after completion', 'Unlock the village map', 'Fast travel between unlocked points', 'Watering can upgrade applies', 'Festival event starts on schedule', 'Achievement unlocks only once']],
    ['ui', 'UI & settings', 'Menus, input, localization and layout.', ['Main menu navigation with controller', 'Settings sliders keep their values', 'Language switch updates all screens', 'Text fits in harvest summary (all languages)', 'Pause menu opens during cutscene', 'HUD scales correctly at 4:3', 'Focus order in the shop panel', 'Credits scroll ends correctly']],
    ['av', 'Audio & visuals', 'Sound, music, VFX and animation.', ['Ambient audio pauses with the game', 'Music crossfades between areas', 'Rain particles render correctly', 'Fog VFX renders below the UI', 'Footsteps match the surface', 'Volume sliders affect the right buses', 'Bench sitting animation', 'Dialogue portraits load without flicker']],
  ];
  const storyBeats = ['intro dialogue triggers', 'main quest marker appears', 'branching choice is saved', 'closing scene plays'];
  const suites: Suite[] = [
    ...suiteDefs.map(([id, name, description]) => ({ id: `suite-${id}`, projectId: 'og', name, description })),
    { id: 'suite-story', projectId: 'og', name: 'Story content', description: 'Chapter beats, dialogue and choices.' },
    { id: 'suite-tt-core', projectId: 'tt', name: 'Turn system', description: 'Turns, undo and timers.' },
  ];
  const rev = (title: string, priority: Priority, tags: string[]): CaseRevision => ({
    rev: 1,
    title,
    preconditions: 'Build under test installed. “QA midgame” save loaded unless the case says otherwise.',
    steps: [
      { action: 'Go to the area or menu this case covers.', expected: 'The area loads with no errors.' },
      { action: `Do the action: ${title.charAt(0).toLowerCase() + title.slice(1)}.`, expected: 'The game responds as designed.' },
      { action: 'Save, reload and check the result again.', expected: 'The result persists after reload.' },
    ],
    priority,
    tags,
    editedAt: ago(60 * 24 * 20),
    editedBy: ME,
  });
  const cases: TestCase[] = [];
  for (const [sid, , , titles] of suiteDefs) {
    titles.forEach((t, i) => cases.push({ id: `${sid}-${i}`, projectId: 'og', suiteId: `suite-${sid}`, revisions: [rev(t, i < 3 ? 'P1' : 'P2', [sid, i < 3 ? 'smoke' : 'regression'])] }));
  }
  for (let ch = 1; ch <= 5; ch++) {
    storyBeats.forEach((beat, i) =>
      cases.push({ id: `story-${ch}-${i}`, projectId: 'og', suiteId: 'suite-story', revisions: [rev(`Chapter ${ch}: ${beat}`, 'P2', ['story', `chapter-${ch}`])] }),
    );
  }
  ['End turn passes control to the opponent', 'Undo restores the previous unit position', 'Tide timer counts down to zero'].forEach((t, i) =>
    cases.push({ id: `tt-${i}`, projectId: 'tt', suiteId: 'suite-tt-core', revisions: [rev(t, 'P1', ['turns'])] }),
  );
  // A case edited after the smoke run: the run keeps revision 1.
  const reconnect = cases.find((c) => c.id === 'save-3')!;
  reconnect.revisions.push({
    ...structuredClone(reconnect.revisions[0]),
    rev: 2,
    preconditions: 'Build under test on a device with network toggling. Stand inside the greenhouse.',
    steps: [
      { action: 'Start harvesting inside the greenhouse.', expected: 'Harvest animation plays.' },
      { action: 'Disable network for 10 s, then enable it.', expected: 'A reconnect banner appears and clears.' },
      { action: 'Walk to the greenhouse exit.', expected: 'The player can leave the greenhouse.' },
    ],
    editedAt: ago(40),
  });

  const byId = (id: string) => cases.find((c) => c.id === id)!;
  const og = (ids: string[]) => ids.map(byId);
  const gameplayIds = suiteDefs.flatMap(([sid]) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `${sid}-${i}`));
  const smokeIds = [...suiteDefs.flatMap(([sid]) => [`${sid}-0`, `${sid}-2`]), 'save-3', 'save-5', 'inventory-7', 'garden-3'];
  const hotfixIds = [...gameplayIds.filter((id) => !smokeIds.includes(id)), ...storyBeats.map((_, i) => `story-1-${i}`)];
  const storyIds = [1, 2, 3, 4, 5].flatMap((ch) => storyBeats.map((_, i) => `story-${ch}-${i}`));

  const testers = ['u-alex', 'u-sam', 'u-jamie', 'u-taylor', 'u-riley'];
  const attempt = (result: ResultValue, min: number, testerId: string, notes = '', findingIds: string[] = []): ResultAttempt => ({
    result,
    notes,
    evidence: result === 'failed' ? 'Video attached to the linked bug.' : '',
    testerId,
    at: ago(min),
    findingIds,
  });
  const fill = (run: Run, plan: Record<string, ResultAttempt[]>, defaultResult: ResultValue | null, startMin: number): Run => ({
    ...run,
    cases: run.cases.map((c, i) => {
      const planned = plan[c.caseId];
      if (planned) return { ...c, attempts: planned };
      if (!defaultResult) return c;
      return { ...c, attempts: [attempt(defaultResult, startMin - i * 3, c.assigneeId ?? testers[i % testers.length])] };
    }),
  });

  // Smoke reflects revision 1 of save-3: build it before the edit by slicing.
  const smokeCases = og(smokeIds).map((c) => (c.id === 'save-3' ? { ...c, revisions: c.revisions.slice(0, 1) } : c));
  let smoke = createRun({ id: 'run-smoke', name: 'Smoke run · 0.8.4', projectId: 'og', buildId: 'og-084', platforms: ['Android', 'PC'], assigneeIds: ['u-alex', 'u-sam'], cases: smokeCases, at: ago(58) });
  smoke = fill(smoke, { 'save-3': [attempt('failed', 50, 'u-alex', 'Player cannot leave the greenhouse after reconnect.', ['CP-104'])] }, 'passed', 56);
  smoke = { ...smoke, status: 'completed', completedAt: ago(45) };

  let hotfix = createRun({ id: 'run-hotfix', name: 'Hotfix regression · 0.8.4', projectId: 'og', buildId: 'og-084', platforms: ['Android', 'iOS', 'PC'], assigneeIds: testers, cases: og(hotfixIds), at: ago(44) });
  const untestedHotfix = ['ui-3', ...storyBeats.map((_, i) => `story-1-${i}`)];
  hotfix = fill(
    hotfix,
    {
      'save-4': [attempt('failed', 20, 'u-sam', 'Rolled back to the morning autosave.', ['CP-109'])],
      'progression-5': [attempt('failed', 18, 'u-jamie', 'Upgrade missing after relaunch.', ['CP-124'])],
      'save-7': [attempt('blocked', 16, 'u-sam', 'Blocked by CP-109: cannot create a valid conflict.', ['CP-109'])],
      'progression-6': [attempt('blocked', 15, 'u-jamie', 'Event server config not available on staging.')],
      'inventory-4': [attempt('failed', 35, 'u-riley', 'Focus skipped the button (CP-142).', ['CP-142']), attempt('passed', 12, 'u-riley', 'Retest with mouse input passes; controller issue tracked separately.')],
      ...Object.fromEntries(untestedHotfix.map((id) => [id, [] as ResultAttempt[]])),
    },
    'passed',
    40,
  );

  let core = createRun({ id: 'run-core', name: 'Core gameplay regression', projectId: 'og', buildId: 'og-084', platforms: ['Android', 'PC', 'Switch'], assigneeIds: ['u-alex', 'u-taylor', 'u-riley'], cases: og(gameplayIds).map((c) => (c.id === 'save-3' ? { ...c, revisions: c.revisions.slice(0, 1) } : c)), at: ago(60 * 26) });
  const coreUntested = gameplayIds.slice(34);
  core = fill(
    core,
    {
      'garden-3': [attempt('failed', 300, 'u-alex', 'Growth timer frozen after sleeping.', ['CP-112'])],
      'save-7': [attempt('blocked', 280, 'u-taylor', 'Needs a second device signed into the same account.')],
      ...Object.fromEntries(coreUntested.map((id) => [id, [] as ResultAttempt[]])),
    },
    'passed',
    600,
  );

  let story = createRun({ id: 'run-story', name: 'Story content pass', projectId: 'og', buildId: 'og-084', platforms: ['PC'], assigneeIds: ['u-jamie'], cases: og(storyIds), at: ago(60 * 20) });
  story = fill(
    story,
    {
      'story-2-1': [attempt('failed', 200, 'u-jamie', 'Quest marker points to the old bridge.')],
      ...Object.fromEntries(storyIds.slice(12).map((id) => [id, [] as ResultAttempt[]])),
    },
    'passed',
    500,
  );

  let smoke083 = createRun({ id: 'run-smoke-083', name: 'Smoke run · 0.8.3', projectId: 'og', buildId: 'og-083', platforms: ['Android', 'PC'], assigneeIds: ['u-alex'], cases: og(smokeIds).map((c) => ({ ...c, revisions: c.revisions.slice(0, 1) })), at: ago(60 * 24 * 9) });
  smoke083 = { ...fill(smoke083, {}, 'passed', 60 * 24 * 9 - 10), status: 'completed', completedAt: ago(60 * 24 * 8.9) };

  const runs = [hotfix, core, story, smoke, smoke083];

  const sessions: Session[] = [
    { id: 'ses-android', projectId: 'og', buildId: 'og-084', platform: 'Android', ownerId: ME, runId: 'run-hotfix', title: 'Android reconnect sweep', status: 'open', createdAt: ago(55), channel: '#demo-qa', threadTs: '1700000000.000101' },
    { id: 'ses-pc-save', projectId: 'og', buildId: 'og-083', platform: 'PC', ownerId: 'u-sam', title: 'PC save/load pass', status: 'closed', createdAt: ago(60 * 24 * 8), closedAt: ago(60 * 24 * 7.9), channel: '#demo-qa', threadTs: '1699000000.000050' },
  ];

  const releases: Release[] = [
    { id: 'rel-084', projectId: 'og', buildId: 'og-084', type: 'hotfix', environment: 'Staging', runIds: ['run-smoke', 'run-hotfix'], revisions: [] },
    {
      id: 'rel-083',
      projectId: 'og',
      buildId: 'og-083',
      type: 'release',
      environment: 'Staging',
      runIds: ['run-smoke-083'],
      revisions: [
        {
          rev: 1,
          savedAt: ago(60 * 24 * 8.8),
          authorId: ME,
          recommendation: 'ready',
          checklist: { smokeLinked: true, blockersReviewed: true, risksAccepted: false },
          rationale: 'Smoke run passed on all target platforms with no open critical bugs.',
          risks: [],
          channel: '#demo-releases',
          evidence: {
            capturedAt: ago(60 * 24 * 8.8),
            runIds: ['run-smoke-083'],
            runSources: [{ runId: 'run-smoke-083', name: 'Smoke run · 0.8.3', capturedAt: ago(60 * 24 * 8.8) }],
            counts: { passed: 16, failed: 0, blocked: 0, untested: 0, na: 0 },
            openBySeverity: { critical: 0, high: 3, medium: 6, low: 5 },
            blockers: [],
            bugsSyncedAt: ago(60 * 24 * 8.8),
          },
          message: '*READY · Orbit Garden 0.8.3*\nQA recommendation: Ready. Smoke run passed on all target platforms with no open critical bugs.\n• Result: 16 / 16 passed (100.0% pass rate, 100.0% executed)\n• Open risks: 0 critical, 3 high, 6 medium, 5 low\nThis is the QA recommendation only; release authorization is separate.',
          sentJobId: 'job-rel-083',
        },
      ],
    },
  ];

  const resources: ResourceLink[] = [
    { id: 'res-1', projectId: 'og', title: 'Orbit Garden game repo', url: 'https://git.example.com/orbit-garden/game', kind: 'Game repo', tags: ['code'], favorite: true, description: 'Main game client.' },
    { id: 'res-2', projectId: 'tt', title: 'Tidepool Tactics game repo', url: 'https://git.example.com/tidepool/game', kind: 'Game repo', tags: ['code'], favorite: false, description: 'Turn-based prototype.' },
    { id: 'res-3', projectId: 'all', title: 'QA suites repo', url: 'https://git.example.com/qa/suites', kind: 'QA repo', tags: ['automation', 'test data'], favorite: true, description: 'Shared test data and helper scripts.' },
    { id: 'res-4', projectId: 'og', title: 'Crash dashboard', url: 'https://dashboards.example.com/orbit-garden/crashes', kind: 'Dashboard', tags: ['stability'], favorite: true, description: 'Crash-free sessions by build.' },
    { id: 'res-5', projectId: 'og', title: 'Performance dashboard', url: 'https://dashboards.example.com/orbit-garden/perf', kind: 'Dashboard', tags: ['performance'], favorite: false, description: 'Frame time and memory by device tier.' },
    { id: 'res-6', projectId: 'og', title: 'Orbit Garden bug board', url: 'https://tracker.example.com/boards/og', kind: 'Board', tags: ['triage'], favorite: false, description: 'Tracker board used by the dev team.' },
    { id: 'res-7', projectId: 'og', title: 'Test plan 0.8.x', url: 'https://docs.example.com/og/test-plan-0-8', kind: 'Documentation', tags: ['plan'], favorite: false, description: 'Scope, risks and platform matrix.' },
    { id: 'res-8', projectId: 'all', title: 'Severity and priority guide', url: 'https://docs.example.com/qa/severity-priority', kind: 'Documentation', tags: ['triage', 'onboarding'], favorite: true, description: 'Severity = player impact, priority = fix order.' },
    { id: 'res-9', projectId: 'og', title: 'Build 0.8.4 · Android', url: 'https://builds.example.com/og/0.8.4/android', kind: 'Build', tags: ['android'], favorite: false, description: 'Internal test track.' },
    { id: 'res-10', projectId: 'og', title: 'Build 0.8.4 · PC', url: 'https://builds.example.com/og/0.8.4/pc', kind: 'Build', tags: ['pc'], favorite: false, description: 'Staging branch.' },
  ];

  const routes: Route[] = projects.flatMap((p) => {
    const ch = p.id === 'og' ? '#demo-qa' : '#tt-qa';
    return [
      { projectId: p.id, type: 'bug' as const, tracker: { enabled: true, list: 'Bugs' }, messaging: { enabled: true, channel: ch } },
      { projectId: p.id, type: 'feedback' as const, tracker: { enabled: true, list: 'Feedback' }, messaging: { enabled: true, channel: '#demo-feedback' } },
      { projectId: p.id, type: 'question' as const, tracker: { enabled: false, list: 'Questions' }, messaging: { enabled: true, channel: '#demo-questions' } },
    ];
  });

  // ---- Mock remote state ----------------------------------------------------
  const remoteStatus: Record<Finding['status'], string> = { draft: 'to do', open: 'to do', in_progress: 'in progress', resolved: 'done', closed: 'closed' };
  const remoteSeverity: Record<Severity, string> = { critical: 'urgent', high: 'high', medium: 'normal', low: 'low' };
  const tasks: RemoteTask[] = findings
    .filter((f) => f.external)
    .map((f) => ({
      externalId: f.external!.externalId,
      dedupeKey: `seed:${f.id}`,
      projectKey: projects.find((p) => p.id === f.projectId)!.key,
      list: 'Bugs',
      title: `${f.id} ${f.title}`,
      status: f.duplicateOf ? 'duplicate' : remoteStatus[f.status],
      severity: f.severity ? remoteSeverity[f.severity] : 'none',
      url: f.external!.url,
      updatedAt: ago(10),
      findingId: f.id,
    }));
  // Created directly in the tracker by a developer, with a status Checkpoint does not map.
  tasks.push({ externalId: 'TSK-3290', projectKey: 'OG', list: 'Bugs', title: 'Sprinkler sometimes waters the wrong tile', status: 'needs info', severity: 'normal', url: 'https://tracker.example.com/t/TSK-3290', updatedAt: ago(90) });
  for (const f of findings) if (f.external) f.external.remoteStatus = tasks.find((t) => t.externalId === f.external!.externalId)!.status;

  const messages: RemoteMessage[] = [
    { ts: '1700000000.000101', channel: '#demo-qa', text: '*Testing session: Android reconnect sweep · Orbit Garden 0.8.4*', dedupeKey: 'session:ses-android' },
    { ts: '1700000000.000140', channel: '#demo-qa', threadTs: '1700000000.000101', text: '*Bug CP-104: Player gets stuck in greenhouse after reconnect*', dedupeKey: 'seed:msg:CP-104' },
  ];
  const remote: MockRemote = { seq: 200, tasks, messages, faults: noFaults() };

  const jobs: DeliveryJob[] = [
    {
      id: 'job-seed-1',
      dedupeKey: 'seed:CP-104',
      payload: { kind: 'tracker.create', findingId: 'CP-104', list: 'Bugs' },
      status: 'delivered',
      createdAt: ago(52),
      attempts: [{ at: ago(52), outcome: 'delivered', detail: 'Created TSK-3104 in Bugs.' }],
      result: { externalId: 'TSK-3104', url: 'https://tracker.example.com/t/TSK-3104' },
    },
    {
      id: 'job-seed-2',
      dedupeKey: 'seed:msg:CP-104',
      payload: { kind: 'messaging.post', channel: '#demo-qa', text: messages[1].text, threadTs: '1700000000.000101', findingId: 'CP-104' },
      status: 'delivered',
      createdAt: ago(52),
      attempts: [{ at: ago(51), outcome: 'delivered', detail: 'Replied in thread on #demo-qa.' }],
      result: { ts: '1700000000.000140' },
    },
    {
      id: 'job-rel-083',
      dedupeKey: 'release:rel-083:1',
      payload: { kind: 'messaging.post', channel: '#demo-releases', text: releases[1].revisions[0].message, releaseId: 'rel-083', rev: 1 },
      status: 'delivered',
      createdAt: ago(60 * 24 * 8.8),
      attempts: [{ at: ago(60 * 24 * 8.8), outcome: 'delivered', detail: 'Posted to #demo-releases.' }],
      result: { ts: '1699100000.000001' },
    },
  ];

  const events: AuditEvent[] = [
    { id: 'ev-1', at: ago(5), actorId: 'u-alex', kind: 'run', title: 'Test run updated', detail: 'Core gameplay regression is now 71% executed.', link: '/test-lab/runs/run-core' },
    { id: 'ev-2', at: ago(14), actorId: 'u-taylor', kind: 'finding', title: 'Bug reported', detail: 'CP-157: Ambient audio keeps playing on pause menu.', link: '/triage/CP-157' },
    { id: 'ev-3', at: ago(37), actorId: 'u-sam', kind: 'question', title: 'Answer received', detail: 'Sam K. answered CP-191: a fix is in progress for 0.8.5.', link: '/triage/CP-191' },
    { id: 'ev-4', at: ago(62), actorId: ME, kind: 'build', title: 'Build added', detail: 'Build 0.8.4 is available for testing.' },
  ];

  return {
    version: 1,
    seededAt: nowDate.toISOString(),
    currentUserId: ME,
    projects,
    builds,
    people,
    findings,
    sessions,
    suites,
    cases,
    runs,
    releases,
    resources,
    routes,
    jobs,
    events,
    ledgers: [],
    remote,
    settings: { statusMapping: DEFAULT_STATUS_MAPPING, digestChannel: '#demo-qa', releaseChannel: '#demo-releases', lastSyncAt: ago(7) },
    ui: {
      projectId: 'og',
      buildId: 'og-084',
      captureDraft: null,
      releaseDrafts: {
        'rel-084': {
          recommendation: 'hold',
          checklist: { smokeLinked: true, blockersReviewed: true, risksAccepted: false },
          rationale: 'Reconnect issue remains unresolved.',
          risks: [],
        },
      },
    },
  };
}
