// The look of every picture, in one place and free of imports: both renderers
// and the state-diagram module read it, and a module that imported them back
// would make a cycle (it did — `PALETTE` was read before it existed).

// Fixed palette: colours carry meaning (data / control / reset), so they must
// not follow the VS Code theme.
export const PALETTE = {
  background: '#ffffff',
  ink: '#111827',
  muted: '#6b7280',
  nodeFill: '#ffffff',
  muxFill: '#f3f4f6',
  controlFill: '#eef2ff',
  controlStroke: '#4f46e5',
  componentFill: '#f8fafc',
  frameStroke: '#94a3b8',

  sketch: '#d97706', // a link the reader drew that the RTL has no net for
  data: '#111827',
  control: '#2563eb',
  reset: '#dc2626',
  clock: '#9ca3af',
} as const

// Helvetica is the one font the PDF writer has, so the SVG asks for the same
// family; a name with a space in it would have to be quoted, which an attribute
// cannot carry.
export const FONT_FAMILY = 'Arial, Helvetica, sans-serif'
export const FONT_SIZE = 12
