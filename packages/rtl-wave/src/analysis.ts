// Reading back what an agent wrote about a waveform.
//
// `.prompt/rtlgraph/waveform/*.md` asks for `<bench>.waveform-analysis.md`: one
// section on how the design comes up, then one per check, each explaining — from
// the code, with line numbers — why the measurements look the way they do. That
// file is written for a person, and stays a file a person can read; this reads
// it back so the same words can sit beside the instants they are about.
//
// Matching is by heading. Nothing is invented: a section whose heading names no
// check is kept aside rather than guessed onto one, and a check with no section
// simply has none.

export interface AnalysisSection {
  heading: string
  /** The prose under it, markdown as written, without the heading line. */
  body: string
}

export interface Analysis {
  /** Everything above the first heading — usually what the file is about. */
  preamble: string
  sections: readonly AnalysisSection[]
}

export function parseAnalysis(markdown: string): Analysis {
  const lines = markdown.split('\n')
  const sections: AnalysisSection[] = []
  const preamble: string[] = []
  let current: { heading: string; body: string[] } | undefined
  for (const line of lines) {
    const heading = /^#{2,6}\s+(.*\S)\s*$/.exec(line)
    if (heading) {
      if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() })
      current = { heading: heading[1], body: [] }
      continue
    }
    if (current) current.body.push(line)
    else if (!/^#\s/.test(line)) preamble.push(line)
  }
  if (current) sections.push({ heading: current.heading, body: current.body.join('\n').trim() })
  return { preamble: preamble.join('\n').trim(), sections }
}

/** Headings and labels meet after the numbering and punctuation are dropped. */
function bare(text: string): string {
  return text
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const COMING_UP = /(coming up|initial|초기|깨어나|리셋)/i

/**
 * Which section belongs to which place. A check's section is the one whose
 * heading quotes what the bench printed; the opening section is whichever one
 * talks about coming up, if the writer wrote one.
 *
 * Returns a map of place id → section, and whatever was left over, so the view
 * can show the rest rather than swallow it.
 */
export function matchAnalysis(
  analysis: Analysis,
  places: readonly { id: string; label: string; kind: 'init' | 'check' }[],
): { matched: Map<string, AnalysisSection>; spare: readonly AnalysisSection[] } {
  const matched = new Map<string, AnalysisSection>()
  const used = new Set<AnalysisSection>()

  for (const place of places) {
    if (place.kind !== 'check') continue
    const label = bare(place.label)
    const found = analysis.sections.find(section => {
      if (used.has(section)) return false
      const heading = bare(section.heading)
      return heading === label || heading.includes(label) || (label.length > 12 && label.includes(heading))
    })
    if (found) {
      matched.set(place.id, found)
      used.add(found)
    }
  }

  const init = places.find(place => place.kind === 'init')
  if (init) {
    const found = analysis.sections.find(section => !used.has(section) && COMING_UP.test(section.heading))
    if (found) {
      matched.set(init.id, found)
      used.add(found)
    }
  }

  return { matched, spare: analysis.sections.filter(section => !used.has(section)) }
}

/** `file.v:12` and `file.v:12-20`, as the prompt asks a writer to cite them. */
export interface Citation {
  text: string
  file: string
  line: number
}

const CITATION = /([\w./-]+\.(?:v|sv|json|md)):(\d+)(?:-(\d+))?/g

export function citationsIn(text: string): Citation[] {
  return [...text.matchAll(CITATION)].map(match => ({
    text: match[0],
    file: match[1],
    line: Number(match[2]),
  }))
}
