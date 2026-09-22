// The words the waveform report and the viewer use, in the two languages this
// project is written in.
//
// Only the prose is translated. Signal paths, times, file names and the
// testbench's own printed lines stay exactly as they are — a report that
// translates what a simulator said is a report that cannot be checked against
// the simulator.

export type Lang = 'en' | 'ko'

export interface Words {
  title: string
  measuredFrom: (vcd: string, simulator?: string) => string
  measuredOnly: string
  askThePrompt: string
  ranTo: (end: string, changes: number, signals: number) => string

  comingUp: string
  nothingUnknownAtZero: string
  unknownAtZero: (count: number, listed: string, more: boolean) => string
  nothingLeftUndefined: string
  stillUndefined: string
  signal: string
  definedAt: string
  neverDefined: string
  allDefinedBy: (when: string, after?: string) => string
  somethingStaysUndefined: string

  clock: string
  clockLine: (path: string, edges: number, period: string, hertz: string) => string
  clockSteady: string
  clockVaries: (count: number, gaps: string, more: boolean) => string

  reset: string
  resetReleased: (path: string, when: string) => string
  resetNeverReleased: (path: string) => string

  drives: string
  changes: string
  onActiveEdge: string
  none: string
  firstAt: (count: number, times: string) => string
  noRace: string
  race: string

  handshake: (valid: string, ready: string) => string
  validRose: string
  taken: string
  waited: string
  held: string
  never: string
  clocks: (n: number) => string
  stillUp: string

  checkByCheck: string
  checkByCheckWhy: string
  reset_in_stretch: string
  busiestHere: string
  nothingMoved: string
  transfersTaken: (count: number, waits: string) => string
  focusValidRose: string
  focusTaken: (clocks: number) => string
  focusResetAsserted: string
  focusResetReleased: string

  unknownAfterReset: string
  neverMoved: string
  busiest: string
  first: string
  last: string

  benchSaid: string
  benchTimed: string
  benchUntimed: string
  when: string
  whatItSaid: string

  why: string
  hoverForValues: string
  wholeRun: string
  zoomIn: string
  zoomOut: string
  previousPlace: string
  nextPlace: string
  ofSignals: (shown: number, total: number) => string
  noDump: (name: string) => string
}

const EN: Words = {
  title: 'What the waveform says',
  measuredFrom: (vcd, simulator) => `Measured from \`${vcd}\`${simulator ? ` (${simulator})` : ''}.`,
  measuredOnly: 'Every number here was read off the dump. Nothing here explains *why* —',
  askThePrompt: 'for that, hand this file and the code to `.prompt/rtlgraph/waveform/english.md`.',
  ranTo: (end, changes, signals) => `Simulated to **${end}** — ${changes} value changes across ${signals} signals.`,

  comingUp: 'Coming up',
  nothingUnknownAtZero: 'Nothing held x or z at time 0 — every signal in the dump started from a value.',
  unknownAtZero: (count, listed, more) =>
    `At time 0, ${count} signal(s) held x or z${more ? ` (${listed}, …)` : `: ${listed}`}. ` +
    'Before a reset that is ordinary; what matters is the next table.',
  nothingLeftUndefined: 'Once the reset was released, nothing was left undefined.',
  stillUndefined: 'Still undefined when the reset let go:',
  signal: 'Signal',
  definedAt: 'Defined at',
  neverDefined: '**never in this run**',
  allDefinedBy: (when, after) => `Everything was defined by **${when}**${after ? `, ${after} after the reset was released.` : '.'}`,
  somethingStaysUndefined: 'Something stays undefined for the whole run — the rows above say which.',

  clock: 'Clock',
  clockLine: (path, edges, period, hertz) => `\`${path}\` — ${edges} rising edges, period ${period}, ${hertz} MHz.`,
  clockSteady: ' The gap between edges never varies.',
  clockVaries: (count, gaps, more) =>
    ` **${count} different gaps** between edges: ${gaps}${more ? ' …' : ''} — a clock that stops (a reset held, a gated domain) looks like this too.`,

  reset: 'Reset',
  resetReleased: (path, when) => `\`${path}\` released at **${when}**.`,
  resetNeverReleased: path => `\`${path}\` never released in this run.`,

  drives: 'What the bench drives',
  changes: 'Changes',
  onActiveEdge: 'On the active edge',
  none: 'none',
  firstAt: (count, times) => `**${count}** — first at ${times}`,
  noRace: 'No bench-driven input moves at the instant the design samples, which is what driving on the opposite edge is for.',
  race: "⚠️ An input that changes on the active edge is a race: which value the design sees is the simulator's choice, not the design's.",

  handshake: (valid, ready) => `Handshake \`${valid}\` / \`${ready}\``,
  validRose: 'Valid rose',
  taken: 'Taken',
  waited: 'Waited',
  held: 'Held',
  never: '**never**',
  clocks: n => `${n} clocks`,
  stillUp: 'still up at the end',

  checkByCheck: 'Check by check',
  checkByCheckWhy: 'Each stretch runs from the previous printed line to this one, so what is listed beside a check is the evidence that check was looking at. Why it passed is a question about the code — that is what the `waveform` prompt is for.',
  reset_in_stretch: 'reset asserted in this stretch',
  busiestHere: 'Busiest here: ',
  nothingMoved: 'nothing moved',
  transfersTaken: (count, waits) => `${count} transfer(s) taken, waiting ${waits} clock(s)`,
  focusValidRose: 'valid rose',
  focusTaken: clocks => `taken after ${clocks} clock(s)`,
  focusResetAsserted: 'reset asserted',
  focusResetReleased: 'reset released',

  unknownAfterReset: 'Still unknown after reset',
  neverMoved: 'Never moved',
  busiest: 'Busiest signals',
  first: 'First',
  last: 'Last',

  benchSaid: 'What the testbench printed',
  benchTimed: 'Times come from the bench itself (`$display("[%0t] …")`), so each line can be lined up with the dump.',
  benchUntimed: 'This bench printed no times, so its lines are in order but cannot be placed on the dump. A bench of ours prefixes `[%0t]`; a handed-out one usually does not.',
  when: 'When',
  whatItSaid: 'What it said',

  why: 'why it passed',
  hoverForValues: 'hover for values',
  wholeRun: 'the whole run',
  zoomIn: 'zoom in',
  zoomOut: 'zoom out',
  previousPlace: 'the place before this one (←)',
  nextPlace: 'the next place (→)',
  ofSignals: (shown, total) => `${shown} of ${total} signals`,
  noDump: name => `No dump for ${name} — run \`.agent/rtlgraph/run-tb.sh --wave\` again.`,
}

const KO: Words = {
  title: '파형이 말하는 것',
  measuredFrom: (vcd, simulator) => `\`${vcd}\` 에서 측정했다${simulator ? ` (${simulator})` : ''}.`,
  measuredOnly: '여기 있는 숫자는 전부 덤프에서 읽은 것이다. **왜** 그런지는 여기 없다 —',
  askThePrompt: '그건 이 파일과 코드를 `.prompt/rtlgraph/waveform/korean.md` 에 주면 된다.',
  ranTo: (end, changes, signals) => `**${end}** 까지 시뮬레이션 — 신호 ${signals}개에 값 변화 ${changes}회.`,

  comingUp: '깨어나는 과정',
  nothingUnknownAtZero: '0시에 x 나 z 를 들고 있던 신호가 없다 — 모든 신호가 값에서 출발했다.',
  unknownAtZero: (count, listed, more) =>
    `0시에 ${count}개 신호가 x 또는 z 였다${more ? ` (${listed}, …)` : `: ${listed}`}. ` +
    '리셋 전이라면 당연한 일이고, 중요한 건 다음 표다.',
  nothingLeftUndefined: '리셋이 풀린 뒤에는 미정의로 남은 것이 없다.',
  stillUndefined: '리셋이 풀렸는데도 미정의였던 것:',
  signal: '신호',
  definedAt: '정의된 시각',
  neverDefined: '**이 실행에서는 끝까지 아님**',
  allDefinedBy: (when, after) => `**${when}** 에는 전부 정의됐다${after ? ` — 리셋 해제 후 ${after}.` : '.'}`,
  somethingStaysUndefined: '실행 내내 미정의로 남는 것이 있다 — 위 표가 무엇인지 말해 준다.',

  clock: '클럭',
  clockLine: (path, edges, period, hertz) => `\`${path}\` — 상승 에지 ${edges}회, 주기 ${period}, ${hertz} MHz.`,
  clockSteady: ' 에지 간격이 한 번도 변하지 않았다.',
  clockVaries: (count, gaps, more) =>
    ` 에지 간격이 **${count}가지**였다: ${gaps}${more ? ' …' : ''} — 리셋 동안 멈춘 클럭이나 게이팅된 도메인도 이렇게 보인다.`,

  reset: '리셋',
  resetReleased: (path, when) => `\`${path}\` 가 **${when}** 에 풀렸다.`,
  resetNeverReleased: path => `\`${path}\` 가 이 실행에서는 끝까지 안 풀렸다.`,

  drives: '벤치가 구동하는 것',
  changes: '변화 횟수',
  onActiveEdge: '활성 에지 위에서',
  none: '없음',
  firstAt: (count, times) => `**${count}회** — 처음은 ${times}`,
  noRace: '설계가 샘플하는 그 순간에 움직이는 벤치 입력이 없다. 반대 에지에서 구동하는 이유가 이것이다.',
  race: '⚠️ 활성 에지에서 바뀌는 입력은 경합이다. 설계가 어느 값을 보는지는 설계가 아니라 시뮬레이터가 정한다.',

  handshake: (valid, ready) => `핸드셰이크 \`${valid}\` / \`${ready}\``,
  validRose: 'valid 상승',
  taken: '가져감',
  waited: '대기',
  held: '유지',
  never: '**끝까지 안 가져감**',
  clocks: n => `${n} 클럭`,
  stillUp: '끝날 때까지 서 있음',

  checkByCheck: '체크별로',
  checkByCheckWhy: '각 구간은 바로 앞의 출력 줄부터 이 줄까지다. 그래서 체크 옆에 적힌 것이 그 체크가 보고 있던 근거다. 왜 통과했는지는 코드에 대한 질문이고, 그건 `waveform` 프롬프트가 할 일이다.',
  reset_in_stretch: '이 구간에 리셋이 걸렸다',
  busiestHere: '여기서 가장 바쁜 것: ',
  nothingMoved: '움직인 것 없음',
  transfersTaken: (count, waits) => `전송 ${count}건 성립, 대기 ${waits} 클럭`,
  focusValidRose: 'valid 상승',
  focusTaken: clocks => `${clocks} 클럭 뒤 가져감`,
  focusResetAsserted: '리셋 걸림',
  focusResetReleased: '리셋 풀림',

  unknownAfterReset: '리셋 후에도 미정의',
  neverMoved: '한 번도 안 움직인 것',
  busiest: '가장 바쁜 신호',
  first: '처음',
  last: '마지막',

  benchSaid: '테스트벤치가 찍은 것',
  benchTimed: '시각은 벤치가 직접 찍은 것이다(`$display("[%0t] …")`). 그래서 각 줄을 덤프 위에 놓을 수 있다.',
  benchUntimed: '이 벤치는 시각을 안 찍어서, 순서는 알아도 덤프 위에 놓을 수는 없다. 우리 벤치는 `[%0t]` 를 앞에 붙이고, 받은 벤치는 대개 안 붙인다.',
  when: '시각',
  whatItSaid: '무엇을 찍었나',

  why: '왜 통과했나',
  hoverForValues: '올려놓으면 값',
  wholeRun: '실행 전체',
  zoomIn: '확대',
  zoomOut: '축소',
  previousPlace: '이전 지점 (←)',
  nextPlace: '다음 지점 (→)',
  ofSignals: (shown, total) => `신호 ${total}개 중 ${shown}개`,
  noDump: name => `${name} 의 덤프가 없다 — \`.agent/rtlgraph/run-tb.sh --wave\` 를 다시 돌려라.`,
}

export function wordsIn(lang: Lang): Words {
  return lang === 'ko' ? KO : EN
}

/** `ko` for Korean, `en` for anything else — VS Code's own tag, or a flag. */
export function langOf(tag: string | undefined): Lang {
  return tag?.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}
