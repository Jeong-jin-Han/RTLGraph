PROJECT_ROOT_ABSOLUTE_PATH = <PROJECT_ROOT_ABSOLUTE_PATH>
PROJECT_FOLDER = PROJECT_ROOT_ABSOLUTE_PATH
IDEA_FILE = <path to the file holding the idea, e.g. PROJECT_FOLDER/idea.txt>

PROJECT_FOLDER/.agent/RTLGRAPH_SPEC.md and PROJECT_FOLDER/.agent/ENVIRONMENT.md
are already prepared for you — read both in full. Follow "Workflow S — Idea →
Spec" specifically.

Read IDEA_FILE and turn that idea into PROJECT_FOLDER/SPEC.md, a specification
concrete enough to write RTL from. Do not write any code yet; this step produces
that one document.

It must cover what is being built, the top module's ports (name, direction,
width, meaning), the components and what each is responsible for, the registers
and the operations between them, the control signal table (input combinations →
outputs), the states and transitions where a state machine is needed, reset and
priority, and how the result will be checked.

Where the idea leaves something open (bit widths, clock rate, initial values),
decide it yourself, and collect every such choice in a "Decisions" section
saying what you chose and why. Put anything that contradicts the idea or stays
unclear in an "Open questions" section. Do not ask me: decide sensibly and run
to the end.

IDEA_FILE may be a PDF as easily as a text file — an assignment handout, a page
of requirements. Whichever it is, that document (or the SPEC.md you write from
it) is what a later RTLGraph pass records as source.spec, and the sentences you
carry across are the ones its boxes will quote, so keep them verbatim.

Write the document in English, and choose signal, module and port names as
identifiers that the code can use as they are.

When done, tell me the document path, a summary of the component structure, and
what is in "Decisions" and "Open questions". If the document looks right, the
next step is .prompt/rtl/english.md.
