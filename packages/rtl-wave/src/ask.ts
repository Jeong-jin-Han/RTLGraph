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
      '그 절에 써야 할 것:',
      '- 이 구간에서 설계가 한 일을, **코드의 어느 줄이 그것을 만드는지**와 함께.',
      '  인용은 `uart_receiver.v:86-87` 형태로, 파일명과 줄번호를 정확히.',
      '- 이 체크가 **실패하려면 무엇이 틀려야 하는지**.',
      '- 측정과 코드 독해가 어긋나면, 매끄럽게 넘기지 말고 그렇게 적을 것.',
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
    'In it:',
    '- what the design did in this stretch, and **which lines of code make it do that**,',
    '  cited as `uart_receiver.v:86-87` — real file, real line numbers.',
    '- what would have to be wrong for this check to fail.',
    '- if the measurements disagree with your reading of the code, say so rather than',
    '  smoothing it over.',
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
