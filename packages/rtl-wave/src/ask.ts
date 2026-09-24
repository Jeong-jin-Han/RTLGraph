// Asking for one reading, not a whole document.
//
// A run has ten checks; explaining all ten against the code is a long job, and
// most of the time a reader wants one of them — the one that surprised them.
// So the view asks per check: this composes the request, the user pastes it
// into whichever agent they use, and the agent appends a single section to the
// analysis file. The view is watching that file, so the answer appears where
// the question was asked.
//
// Everything the agent needs to be accurate is in the request: the measured
// numbers for that stretch, where the check was printed, and the rule that
// nothing else may be invented.

import { asValue, atTime, type WindowFacts } from './facts.ts'
import type { Marker } from './view.ts'
import { wordsIn, type Lang } from './words.ts'

export interface AskFor {
  /** The file the answer is appended to. */
  analysis: string
  /** The report the numbers come from. */
  report: string
  place: Marker
  window?: WindowFacts
  tick: number
  project?: string
}

function measurements(ask: AskFor, lang: Lang): string[] {
  const at = (time: number) => atTime(time, ask.tick)
  const lines = [`- ${lang === 'ko' ? '구간' : 'stretch'}: ${at(ask.place.from)} → ${at(ask.place.to)}`]
  for (const moment of ask.place.focus) {
    lines.push(`- ${at(moment.at)} — ${moment.what}${moment.signal ? ` (${moment.signal})` : ''}`)
  }
  for (const entry of ask.window?.did ?? []) {
    const from = asValue(entry.from, entry.width)
    const to = asValue(entry.to, entry.width)
    lines.push(`- ${entry.path}: ${from} → ${to}, ${entry.changes} change(s)` +
      (entry.pulses !== undefined ? `, ${entry.pulses} pulse(s)` : '') +
      (entry.counted ? `, counting ${entry.counted}` : ''))
  }
  if (ask.window?.source) {
    lines.push(`- ${lang === 'ko' ? '이 줄이 찍었다' : 'printed by'}: ${ask.window.source.file}:${ask.window.source.line}` +
      `  ${ask.window.source.text}`)
  }
  return lines
}

/** The text to paste into an agent, for this one place. */
export function askFor(ask: AskFor, lang: Lang = 'en'): string {
  const w = wordsIn(lang)
  const heading = ask.place.kind === 'init' ? w.comingUp : ask.place.label
  const numbers = measurements(ask, lang).join('\n')

  if (lang === 'ko') {
    return [
      `${ask.project ?? '.'} 에서, 아래 한 가지만 분석해줘.`,
      '',
      `읽을 것: ${ask.report} (측정값), 그리고 그 프로젝트의 RTL.`,
      `쓸 것: ${ask.analysis} 에 **절 하나를 덧붙여**. 이미 있는 내용은 건드리지 마.`,
      '',
      `절 제목은 정확히 이것으로: \`## ${heading}\``,
      '',
      '그 절은 **세 칸 고정**이다. 다른 절들과 같은 모양이어야 하니까:',
      '',
      '```',
      '목적 — 무엇을 증명하려는 시험인가. 한 문장.',
      '방식 — 벤치가 무엇을 했나: 자극과 기대값, 벤치 줄 인용 하나.',
      '결과 — 측정된 시각과 값 → 통과 → 설계 안에서 그것을 만든 줄.',
      '',
      '### 더 보기',
      '곁가지 관찰과 표. 접히는 곳이라 길어도 된다.',
      '```',
      '',
      '결과 칸의 핵심은 **설계 안에서 무슨 일이 어떤 순서로 일어나는지**다. 테스트벤치가',
      '무엇을 했는지가 아니라, 그 자극이 설계 안에서 신호 → 신호 → 레지스터로 어떻게',
      '번져 결과가 되는지. 예: "start 가 뜬다(`x.v:74`) → bit_counter 가 10 이 된다',
      '(`x.v:95`) → sample 마다 rx_shift 로 한 비트씩(`x.v:114`) → 정지 비트의 심볼',
      '에지에서 has_byte 가 선다(`x.v:123`)". 각 단계에 줄 인용.',
      '이 체크가 **실패하려면 무엇이 틀려야 하는지**도 한 줄. 측정과 코드 독해가',
      '어긋나면 매끄럽게 넘기지 말고 그렇게 적을 것.',
      '',
      '쓰는 법(같은 파일의 다른 절과 같아야 한다): **틀릴 수 있는 문장만 결과다** —',
      '"정상 동작한다"는 틀릴 수 없으니 정보가 0 이다. 신호는 **코드 철자 그대로** 한 이름으로.',
      '첫 문장은 이 체크의 앞 절이 쓴 말에서 시작해라. 다 쓰고 한 번 줄이되, 증거는 지우지 말고',
      '`### 더 보기` 로 내려라.',
      '',
      '규칙: 숫자는 아래 측정값에서만 가져와. 설계 파라미터로 다시 계산하지도,',
      '반올림하지도, "대략"이라고 쓰지도 마. 없는 값은 없다고 써.',
      '',
      '이 구간의 측정값:',
      numbers,
      '',
      '다른 체크는 건드리지 말고, 이 절 하나만 쓰고 끝내.',
    ].join('\n')
  }
  return [
    `In ${ask.project ?? '.'}, explain just this one thing.`,
    '',
    `Read: ${ask.report} (the measurements) and the project's RTL.`,
    `Write: **append one section** to ${ask.analysis}. Leave what is already there alone.`,
    '',
    `Head the section exactly: \`## ${heading}\``,
    '',
    'The section has **three fields, fixed** — it has to match the others:',
    '',
    '```',
    'Purpose — what this test is out to prove. One sentence.',
    'How — what the bench did: the stimulus and the expected value, one bench citation.',
    'Outcome — the measured times and values → it passed → the line of the design that',
    'made it so.',
    '',
    '### More',
    'Side observations and tables. This folds away, so it can run long.',
    '```',
    '',
    'What matters most in Outcome is **the path through the design**, in order: not what',
    'the testbench did, but how that stimulus travels signal → signal → register until it',
    'is the result. "start rises (`x.v:74`) → bit_counter loads 10 (`x.v:95`) → each',
    'sample shifts one bit into rx_shift (`x.v:114`) → has_byte sets on the stop bit\'s',
    'symbol edge (`x.v:123`)". A line citation on every step. Then a line on what would',
    'have to be wrong for this check to fail. If the measurements disagree with your',
    'reading of the code, say so rather than smoothing it over.',
    '',
    'How to write it, so it matches the other sections: **only a sentence that could be',
    'false is a result** — "it behaves correctly" cannot be, so it carries nothing. One',
    'name per signal, the code\'s own spelling. Open from wording the previous section',
    'used. Shorten once at the end, moving evidence under `### More` rather than cutting it.',
    '',
    'Rules: every number comes from the measurements below. Do not re-derive a time',
    'from the design\'s parameters, do not round, do not say "about". If something is',
    'not in the measurements, say that it is not.',
    '',
    'The measurements for this stretch:',
    numbers,
    '',
    'Write that one section and stop; leave the other checks for later.',
  ].join('\n')
}
