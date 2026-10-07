#!/usr/bin/env bash
# RTLGraph — run the testbenches of this project and say which passed.
#
# It exists for one moment in particular: the bench you will be marked with
# arrives, and you want its verdict before you have finished reading the mail.
# Drop the file into tb/given/ and run
#
#     .agent/rtlgraph/run-tb.sh given
#
# The two folders are the whole convention:
#
#     tb/given/   what was handed out. Never edited, never rewritten.
#     tb/mine/    what you (or the agent) wrote. Additional evidence.
#
# They are storage. The bench that is *running* is put in the project folder
# itself, where the handout expects a testbench to be — one at a time, swapped
# in before the run and taken out after, so the project never holds two. Use
# --keep to leave the last one there (for Vivado's GUI, or to hand it in).
#
# Usage:
#   .agent/rtlgraph/run-tb.sh [given|mine|all|<file.v> ...] [options]
#
#   --project DIR   the project root (default: the folder holding .agent)
#   --sim NAME      iverilog | vivado  (default: whichever is installed)
#   --out DIR       where build scratch goes (default: <project>/.rtlgraph-build)
#   --top NAME      the bench's top module, when the file holds more than one
#   --wave          also dump a waveform and read it, under the same folder the
#                   bench came from: waveform/given/<bench>.vcd and
#                   <bench>.waveform.json, which is what the viewer opens
#   --wave-depth N  with --wave, dump only N levels under the bench (0 = all).
#                   A netlist of vendor cells has nothing readable inside it
#   --timeout SEC   give up on a bench that has run this long (default 900,
#                   0 waits forever; RTLGRAPH_TIMEOUT sets it too)
#   --report        with --wave, also write <bench>.waveform.md — the same
#                   measurements as prose, for reading without the editor
#   --keep-build    keep the compiler's scratch even when a bench passed
#                   RTLGRAPH_LANG=ko writes in Korean
#   --keep          leave the last bench swapped into the project folder
#   --in-place      do not swap anything; compile the benches where they lie
#   --quiet         only the verdict lines, no simulator output
#   -h, --help      this text
#
# With --wave the bench is never edited to make it dump: a small module beside
# it calls $dumpvars, and .agent/rtlgraph/wave.mjs turns the dump into
# <project>/waveform/<given|mine>/<bench>.waveform.{json,md} — measurements only, kept with
# the project rather than among the tools. The "why did this pass?" reading is a
# separate job, for .prompt/rtlgraph/components/waveform/*.md.
#
# Exit status is 0 only when every bench that ran reported PASS.

set -u

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project=$(cd -- "$here/../.." && pwd)  # .agent/rtlgraph/<script> → the project
sim=""
out=""
top=""
quiet=0
keep=0
swap=1
wave=0
wavedepth=0
report=0
keepbuild=0
limit=${RTLGRAPH_TIMEOUT:-900}
want=()

while [ $# -gt 0 ]; do
  case "$1" in
    --project) project=$(cd -- "$2" && pwd); shift 2 ;;
    --sim) sim="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --top) top="$2"; shift 2 ;;
    --wave) wave=1; shift ;;
    --wave-depth) wave=1; wavedepth="$2"; shift 2 ;;
    --timeout) limit="$2"; shift 2 ;;
    --report) report=1; shift ;;
    --keep-build) keepbuild=1; shift ;;
    --keep) keep=1; shift ;;
    --in-place) swap=0; shift ;;
    --quiet) quiet=1; shift ;;
    -h|--help) sed -n '2,38p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "run-tb: unknown option $1 (try --help)" >&2; exit 2 ;;
    *) want+=("$1"); shift ;;
  esac
done
[ ${#want[@]} -eq 0 ] && want=(all)
[ -n "$out" ] || out="$project/.rtlgraph-build"

# ── the two folders ───────────────────────────────────────────────────────────
# Made on every run, not only when they are missing: the point of the split is
# that there is always somewhere obvious to drop the bench that decides the mark.
mkdir -p "$project/tb/given" "$project/tb/mine"
[ -f "$project/tb/given/README.md" ] || cat > "$project/tb/given/README.md" <<'EOF'
The testbench that came with the assignment goes here, exactly as it arrived.
Nothing in this folder is ever edited: it is what the work is marked with, so a
change here is a change to the ruler. `.agent/rtlgraph/run-tb.sh given` swaps it into the
project folder, runs it, and takes it back out.
EOF
[ -f "$project/tb/mine/README.md" ] || cat > "$project/tb/mine/README.md" <<'EOF'
The testbenches written for this project. Each one opens with a comment saying
what it is there to catch. `.agent/rtlgraph/run-tb.sh mine` runs them.
EOF

# ── what to run ───────────────────────────────────────────────────────────────
# A bench is a file in tb/given or tb/mine, or — for a project laid out the old
# way — any tb_*.v / *_tb.v sitting with the code.
list_dir() { [ -d "$1" ] && find "$1" -maxdepth 1 \( -name '*.v' -o -name '*.sv' \) | sort; }
list_stray() {
  # `sim/` is skipped here as well as in the design files: those benches judge
  # nothing by design — they print cycle numbers for the specification — and
  # listing them as testbenches fills the verdict table with "SAID NOTHING".
  find "$project" \( -name .git -o -name node_modules -o -name 'xsim.dir' -o -path "$out" \
    -o -name sim -o -path "$project/tb/given" -o -path "$project/tb/mine" \) -prune -o \
    \( -name 'tb_*.v' -o -name '*_tb.v' -o -name 'TB_*.v' -o -name 'tb_*.sv' -o -name '*_tb.sv' \) -print | sort
}

benches=()
for choice in "${want[@]}"; do
  case "$choice" in
    given) while IFS= read -r f; do benches+=("$f"); done < <(list_dir "$project/tb/given") ;;
    mine)  while IFS= read -r f; do benches+=("$f"); done < <(list_dir "$project/tb/mine") ;;
    all)
      while IFS= read -r f; do benches+=("$f"); done < <(list_dir "$project/tb/given")
      while IFS= read -r f; do benches+=("$f"); done < <(list_dir "$project/tb/mine")
      while IFS= read -r f; do benches+=("$f"); done < <(list_stray)
      ;;
    *)
      if [ -f "$choice" ]; then benches+=("$(cd -- "$(dirname -- "$choice")" && pwd)/$(basename -- "$choice")")
      else echo "run-tb: no such bench: $choice" >&2; exit 2; fi ;;
  esac
done

if [ ${#benches[@]} -eq 0 ]; then
  # Say which folder was looked in, not just "nothing found": an empty tb/given
  # is the normal state until the marking bench arrives, and the other folder
  # usually has something in it.
  case "${want[*]}" in
    given) echo "run-tb: tb/given/ is empty — nothing has been handed out to be marked against yet." ;;
    mine)  echo "run-tb: tb/mine/ is empty — no bench of our own has been written yet." ;;
    *)     echo "run-tb: no testbench anywhere. The handed-out one goes in tb/given/, ours in tb/mine/ — both folders are there, waiting." ;;
  esac
  for other in given mine; do
    n=$(list_dir "$project/tb/$other" | wc -l)
    [ "$n" -gt 0 ] && echo "        tb/$other/ has $n — run: .agent/rtlgraph/run-tb.sh $other"
  done
  exit 0
fi

# ── the design ────────────────────────────────────────────────────────────────
# Everything that is not a bench, .base/ included, so a skeleton that
# instantiates DFF without shipping one still elaborates.
bench_names=()
for f in "${benches[@]}"; do bench_names+=("$(basename -- "$f")"); done
while IFS= read -r f; do bench_names+=("$(basename -- "$f")"); done < <(list_dir "$project/tb/given"; list_dir "$project/tb/mine")

# Copies of the design live in the tree too — a submission staging folder, a
# Vivado project, a build directory. Compiling one alongside the original
# declares every module twice, so they are pruned, and any duplicate that gets
# through is dropped by module name below.
sources=()
seen_modules=" "
while IFS= read -r f; do
  case "$f" in */tb/*) continue ;; esac
  base=$(basename -- "$f")
  case "$base" in tb_*|TB_*|*_tb.v|*_tb.sv) continue ;; esac
  # A bench left in the project folder by an earlier --keep is a bench, whatever
  # it is called; compiling it as a source would define its module twice. Every
  # name held in tb/given or tb/mine counts, not only the ones running now.
  skip=0
  for known in "${bench_names[@]}"; do [ "$base" = "$known" ] && skip=1; done
  [ "$skip" = 1 ] && continue
  # The same module from two places: keep the first, which is the shallowest.
  for module in $(sed -n 's/^[[:space:]]*module[[:space:]]\+\([A-Za-z_][A-Za-z0-9_$]*\).*/\1/p' "$f"); do
    case "$seen_modules" in
      *" $module "*) skip=1; echo "note: ${f#"$project"/} skipped — module $module is already defined elsewhere" ;;
      *) seen_modules="$seen_modules$module " ;;
    esac
  done
  [ "$skip" = 1 ] && continue
  sources+=("$f")
done < <(find "$project" \( -name .git -o -name node_modules -o -name 'xsim.dir' -o -path "$out" \
    -o -name submission -o -name build -o -name dist -o -name .Xil -o -name '.rtlgraph-build' \
    -o -name sim \
    -o -name '*.sim' -o -name '*.cache' -o -name '*.runs' -o -name '*.hw' -o -name '*.ip_user_files' \) -prune -o \
  \( -name '*.v' -o -name '*.sv' \) -print | sort -t/ -k1 | awk '{print gsub(/\//,"/") "\t" $0}' | sort -n | cut -f2-)

# `sim/` is pruned above with the build folders: the specification prompt puts
# measuring benches there — files that judge nothing and print cycle numbers —
# and a bench compiled as a design file is a second top with a syntax the
# design never asked for.

# ── cells nothing in the project defines ──────────────────────────────────────
# A handed-out core is sometimes a synthesized netlist: thousands of the FPGA
# vendor's own cells (LUT6, FDRE, CARRY4 …) that no file here defines, and that
# FDRE expects `glbl.GSR` beside it as a second top. Compiled with the project
# alone, not one bench builds.
#
# Which cells those are is not worth a list — a list only knows the cells
# somebody has already hit. What is checkable is simpler: a module is
# instantiated and nothing in the sources declares it. If that happens and a
# Vivado library is on this machine, hand it over; the search is lazy, so a
# library passed when it was not needed costs nothing.
#   RTLGRAPH_VENDOR_SRC=<dir holding unisims/ and glbl.v> skips the search.
vendor_src=""
undefined_modules() {
  [ ${#sources[@]} -gt 0 ] || return 0
  awk '
    # `module foo` — declared here, so never missing.
    /^[[:space:]]*module[[:space:]]+[A-Za-z_]/ { sub(/^[[:space:]]*module[[:space:]]+/, ""); sub(/[^A-Za-z0-9_$].*$/, ""); declared[$0] = 1; next }
    # `FDRE #(.INIT(0)) ff_a (` or `LUT6 lut_1 (` — a name, then an instance
    # name, then an open bracket. Keywords that read the same way are skipped.
    /^[[:space:]]*[A-Za-z_][A-Za-z0-9_$]*[[:space:]]*(#[[:space:]]*\(.*\))?[[:space:]]+[A-Za-z_][A-Za-z0-9_$]*[[:space:]]*\(/ {
      line = $0; sub(/^[[:space:]]*/, "", line); sub(/[^A-Za-z0-9_$].*$/, "", line)
      if (line !~ /^(module|endmodule|always|always_ff|always_comb|always_latch|initial|final|assign|if|else|for|while|repeat|forever|case|casex|casez|begin|end|task|function|generate|wire|reg|logic|integer|real|time|genvar|parameter|localparam|input|output|inout|defparam|specify|table|posedge|negedge|return|disable|wait|fork|join|automatic|static|typedef|import|export|package|interface|modport|property|sequence|assert|assume|cover|bind|class|virtual|extern|pure|context)$/) used[line] = 1
      next
    }
    END { for (name in used) if (!(name in declared)) print name }
  ' "${sources[@]}" | sort -u
}
find_vendor_src() {
  local c tool settings
  tool=$(command -v xvlog 2>/dev/null || true)
  settings=$(grep -o '/[^` ]*/settings64\.sh' "$here/ENVIRONMENT.md" 2>/dev/null | head -1)
  for c in "${RTLGRAPH_VENDOR_SRC:-}" \
           "${XILINX_VIVADO:+$XILINX_VIVADO/data/verilog/src}" \
           "${tool:+$(dirname -- "$(dirname -- "$tool")")/data/verilog/src}" \
           "${settings:+$(dirname -- "$settings")/data/verilog/src}" \
           $(ls -d /tools/Xilinx/Vivado/*/data/verilog/src /opt/Xilinx/Vivado/*/data/verilog/src 2>/dev/null | sort -r); do
    [ -n "$c" ] && [ -d "$c/unisims" ] && [ -f "$c/glbl.v" ] && { printf '%s' "$c"; return 0; }
  done
  return 1
}
missing=$(undefined_modules)
if [ -n "$missing" ]; then
  if vendor_src=$(find_vendor_src); then
    echo "note: $(echo "$missing" | wc -l) module(s) are instantiated and defined nowhere here ($(echo "$missing" | head -3 | tr '\n' ' ')…);"
    echo "      taking them from $vendor_src/unisims, with glbl as a second top."
  else
    vendor_src=""
    echo "note: these modules are instantiated and defined nowhere in the project:"
    echo "$missing" | head -8 | sed 's/^/        /'
    echo "      If they are Xilinx cells, set RTLGRAPH_VENDOR_SRC to the folder holding unisims/ and glbl.v,"
    echo "      or source Vivado's settings64.sh. If they are the project's own, a file is missing."
  fi
fi

# ── the simulator ─────────────────────────────────────────────────────────────
if [ -z "$sim" ]; then
  if command -v iverilog >/dev/null 2>&1; then sim=iverilog
  elif command -v xvlog >/dev/null 2>&1; then sim=vivado
  else
    echo "run-tb: no simulator on PATH." >&2
    echo "  iverilog:  sudo apt install iverilog" >&2
    echo "  Vivado:    source /tools/Xilinx/Vivado/<version>/settings64.sh" >&2
    echo "  .agent/rtlgraph/ENVIRONMENT.md lists what this machine has." >&2
    exit 3
  fi
fi

mkdir -p "$out"

# A simulation that waits for something never comes back, and a runner that
# waits with it is worse than a failed bench: the one time this happened, xsim
# sat at its own prompt for ten minutes and had to be killed, which left a copy
# of the bench in the project folder.
limited() { # the command to run under the time limit
  if [ "$limit" -gt 0 ] && command -v timeout >/dev/null 2>&1; then
    timeout --foreground -k 5 "$limit" "$@"
    local status=$?
    [ "$status" -eq 124 ] && echo "run-tb: no output for ${limit}s — stopped. --timeout 0 waits forever."
    return $status
  fi
  "$@"
}

module_of() { sed -n 's/^[[:space:]]*module[[:space:]]\+\([A-Za-z_][A-Za-z0-9_$]*\).*/\1/p' "$1" | head -1; }

# A .v bench is Verilog-2005 until it proves otherwise: compiling it as
# SystemVerilog turns words like `expect` into keywords and breaks a bench that
# was fine. So try the plain dialect first and widen only if it fails.
dialects_for() {
  case "$1" in *.sv) echo "-g2012"; return ;; esac
  # …unless the design itself is SystemVerilog, in which case -g2005 can only
  # fail, and its log — a wall of "requires SystemVerilog" about files the
  # reader did not write — is the one that used to be shown.
  case " ${sources[*]} " in *.sv\ *|*.sv) echo "-g2005-sv -g2012"; return ;; esac
  echo "-g2005 -g2005-sv -g2012"
}

# A module that dumps, compiled alongside a bench that was never asked to. The
# bench keeps its own file untouched — which matters most for the one bench we
# are not allowed to edit.
dumper_for() { # bench, workdir → prints the file to compile with it, or nothing
  local bench=$1 work=$2 top
  [ "$wave" = 1 ] || return 0
  top=${top:-$(module_of "$bench")}
  # Depth 0 is everything under the bench, which is what a reader wants of a
  # design they can hold in their head. A netlist of five thousand vendor cells
  # is not that, and nobody reads inside a LUT: --wave-depth 3 stops there.
  cat > "$work/rtlgraph_dumper.v" <<DUMPER
module rtlgraph_dumper;
    initial begin
        \$dumpfile("$work/wave.vcd");
        \$dumpvars($wavedepth, $top);
    end
endmodule
DUMPER
  printf '%s' "$work/rtlgraph_dumper.v"
}

# What the compiler said, into the build log, trimmed. A vendor library warns
# about itself on every build — 250 lines of it before the bench says anything —
# and those lines are about the library, not about this project.
show_compile_log() { # file → the build log
  local n shown="$1.shown"
  if [ -n "$vendor_src" ]; then grep -vF "$vendor_src/" "$1" > "$shown"; else cp "$1" "$shown"; fi
  n=$(wc -l < "$shown")
  if [ "$n" -le 30 ]; then cat "$shown"
  else
    head -8 "$shown"
    echo "(… $((n - 8)) more compiler lines — --keep-build keeps them in ${1#"$project"/})"
  fi
  n=$(( $(wc -l < "$1") - n ))
  [ "$n" -eq 0 ] || echo "($n warnings from inside the vendor library are not shown)"
  rm -f "$shown"
}

# Everything the build says goes to $build; stdout is the simulation's own
# output and nothing else, because that is what the verdict is read from.
run_iverilog() { # bench, workdir, build log
  local bench=$1 work=$2 build=$3 tried="" dump unit dialect mode clog best="" bestn=-1 n
  local extra=() roots=() sel=()
  dump=$(dumper_for "$bench" "$work")
  unit=${top:-$(module_of "$bench")}
  roots=(-s "$unit")
  if [ -n "$vendor_src" ]; then
    extra=(-y "$vendor_src/unisims" "$vendor_src/glbl.v")
    roots+=(-s glbl)
  fi
  [ -n "$dump" ] && roots+=(-s rtlgraph_dumper)
  for dialect in $(dialects_for "$bench"); do
    # First the way it has always been built: every module nobody instantiates
    # is a top. Only when that fails, name the bench as the one top — a project
    # can carry a top that is not meant to elaborate yet (a board wrapper for a
    # later lab), and it must not take the bench down with it.
    for mode in all only; do
      sel=()
      [ "$mode" = only ] && sel=("${roots[@]}")
      clog="$work/compile.$dialect.$mode.log"
      if iverilog "$dialect" ${sel[@]+"${sel[@]}"} -o "$work/a.out" "$bench" "${sources[@]}" ${dump:+"$dump"} ${extra[@]+"${extra[@]}"} > "$clog" 2>&1; then
        show_compile_log "$clog" >> "$build"
        [ "$mode" = only ] && echo "(built with $unit as the only top: another top-level module here does not elaborate on its own — see compile.$dialect.all.log with --keep-build)" >> "$build"
        ( cd -- "$project" && limited vvp -n "$work/a.out" )
        return
      fi
      # Keep the attempt that got furthest rather than the first one. With a
      # SystemVerilog design the first log says only "requires SystemVerilog",
      # which hides whatever the real reason was.
      n=$(grep -c 'error' "$clog")
      if [ "$bestn" -lt 0 ] || [ "$n" -lt "$bestn" ]; then best=$clog; bestn=$n; fi
      tried="$tried $dialect/$mode"
    done
  done
  {
    grep -E 'error|sorry|give up' "$best" | head -40
    echo "(iverilog: none of$tried compiled it; the lines above are from the attempt that got furthest, $(basename -- "$best"))"
  } >> "$build"
  return 9
}

run_vivado() { # bench, workdir, build log
  local bench=$1 work=$2 build=$3 unit f
  local vfiles=() svfiles=() libs=() tops=()
  unit=${top:-$(module_of "$bench")}
  tops=("$unit")
  # xvlog reads SystemVerilog only when told to, whatever the file is called,
  # so the two kinds are compiled apart: a .v bench over a .sv bus is normal.
  for f in "$bench" "${sources[@]}"; do
    case "$f" in *.sv) svfiles+=("$f") ;; *) vfiles+=("$f") ;; esac
  done
  if [ -n "$vendor_src" ]; then
    vfiles+=("$vendor_src/glbl.v")
    libs=(-L unisims_ver -L unimacro_ver -L secureip)
    tops+=(glbl)
  fi
  # --relax is what Vivado's own simulation script passes: without it a design
  # that mixes files with and without a `timescale stops at elaboration, which
  # the GUI never shows you because the GUI passes it.
  ( cd -- "$work" && : > compile.log \
      && { [ ${#vfiles[@]} -eq 0 ] || xvlog "${vfiles[@]}" >> compile.log 2>&1; } \
      && { [ ${#svfiles[@]} -eq 0 ] || xvlog --sv "${svfiles[@]}" >> compile.log 2>&1; } \
      && xelab --relax -debug typical ${libs[@]+"${libs[@]}"} "${tops[@]}" -s tb_snapshot >> compile.log 2>&1 ) \
    || { grep -E 'ERROR|error' "$work/compile.log" | head -40 >> "$build"; return 9; }
  show_compile_log "$work/compile.log" >> "$build"
  # xsim runs where its snapshot is, which is not where a bench's relative
  # paths resolve: -xsimdir would fix that, but xsim mis-parses it when the
  # path holds a space and then sits at its prompt. So stdin is /dev/null —
  # anything that would wait for a person ends the run instead of hanging it —
  # and a bench that reads a file by a relative path is run from $project by
  # iverilog and not by this path. Say so rather than let it look like a fault
  # in the design.
  grep -lE '\$readmem[bh]|\$fopen' -- "$bench" >/dev/null 2>&1 \
    && echo "note: this bench reads a file; under Vivado it is read from $(basename -- "$work"), not from the project folder" >> "$build"
  ( cd -- "$work" && limited xsim tb_snapshot -runall < /dev/null )
}

# ── run ───────────────────────────────────────────────────────────────────────
printf '%s with %s, %d design file(s)\n\n' "$(basename -- "$project")" "$sim" "${#sources[@]}"
verdicts=()
silent=0
failed=0
placed=""   # the copy we put in the project folder, so we can take it out again
restore=""  # what that copy displaced, parked in $out until the run is over
unplace() {
  [ -n "$placed" ] || return 0
  rm -f "$placed"
  [ -z "$restore" ] || mv "$restore" "$placed"
  placed=""; restore=""
}
trap 'unplace' EXIT INT TERM

# A run that was killed (a simulator that hung, a closed terminal) leaves its
# copy of the bench in the project folder, and the next run then treats that
# copy as a file of the project's own — it is compiled twice, under two names.
# Say so and take it out.
for bench in "${benches[@]}"; do
  stale="$project/$(basename -- "$bench")"
  if [ "$swap" = 1 ] && [ "$(dirname -- "$bench")" != "$project" ] && [ -e "$stale" ] \
     && cmp -s "$bench" "$stale"; then
    echo "note: $(basename -- "$stale") was left in the project folder by a run that did not finish; removing it"
    rm -f "$stale"
  fi
done

for bench in "${benches[@]}"; do
  rel=${bench#"$project"/}
  work="$out/$(basename -- "${bench%.*}")"
  rm -rf "$work"; mkdir -p "$work"
  echo "── $rel"
  log="$work/run.log"

  # Swap it into the project folder: it is where the handout puts a testbench,
  # and where a bench's own relative paths ($readmemh, `include) resolve from.
  unplace
  active=$bench
  if [ "$swap" = 1 ] && [ "$(dirname -- "$bench")" != "$project" ]; then
    placed="$project/$(basename -- "$bench")"
    if [ -e "$placed" ]; then restore="$out/displaced-$(basename -- "$bench")"; mv "$placed" "$restore"; fi
    cp "$bench" "$placed"
    active=$placed
    echo "   (in $(basename -- "$project")/$(basename -- "$bench") for the run)"
  fi

  # Two logs, not one. The verdict is read from what the simulation printed,
  # and a compiler warning with the word "error" in it is not the bench
  # failing — which is exactly how a vendor library once turned a pass into a
  # fail. Both are shown; only one is judged.
  build="$work/build.log"; : > "$build"
  if [ "$sim" = vivado ]; then run_vivado "$active" "$work" "$build" > "$log" 2>&1; status=$?
  else run_iverilog "$active" "$work" "$build" > "$log" 2>&1; status=$?; fi
  if [ "$quiet" != 1 ]; then
    [ -s "$build" ] && sed 's/^/   /' "$build"
    sed 's/^/   /' "$log"
  fi

  # A bench decides its own verdict; this only reads it. A bench that says so
  # at the head of a line — `PASS`, `[ 1234 ] FAIL …` — is taken at its word
  # and nothing else is weighed: that is the shape the spec asks benches to
  # print, and it cannot be tripped by a sentence that happens to hold the
  # word "error". Only a bench that says nothing so plainly is read loosely.
  spoke() { grep -Eqi "^[[:space:]]*(\[[^]]*\][[:space:]]*)?$1\b" "$log"; }
  if [ $status -eq 9 ]; then verdict="DID NOT COMPILE"
  elif spoke 'fail(ed|ure)?'; then verdict=FAIL
  elif spoke 'pass(ed)?'; then verdict=PASS
  elif grep -Eqi '(^|[^A-Za-z])(fail(ed|ure)?|error)([^A-Za-z]|$)|\$fatal|mismatch(es)?:? *[1-9]|Errors: *[1-9]' "$log"; then verdict=FAIL
  elif grep -Eqi '(^|[^A-Za-z])pass(ed)?([^A-Za-z]|$)|0 mismatch|test(bench)? (complete|finished|done)' "$log"; then verdict=PASS
  elif [ $status -ne 0 ]; then verdict=FAIL
  else verdict="SAID NOTHING"; fi
  case "$verdict" in
    PASS) ;;
    "SAID NOTHING") silent=$((silent + 1)) ;;  # ran fine, judged nothing — a handed-out
    *) failed=$((failed + 1)) ;;               # bench often has no PASS line at all
  esac
  if [ "$wave" = 1 ] && [ -f "$work/wave.vcd" ]; then
    # The dump and what was read off it belong to the project, beside the code,
    # not inside the folder the tools were copied into.
    # waveform/ mirrors tb/: what a run produced sits under the same name as the
    # bench that produced it. Which side a result came from is then structural —
    # no prefix to invent, and no way for the handout's report and ours to land
    # on the same file when both benches are called tb_uart.v.
    case "$bench" in
      */tb/given/*) waves="$project/waveform/given" ;;
      */tb/mine/*) waves="$project/waveform/mine" ;;
      *) waves="$project/waveform" ;;  # a bench left lying with the code
    esac
    mkdir -p "$waves"
    stem=$(basename -- "${bench%.*}")
    mv -f "$work/wave.vcd" "$waves/$stem.vcd"
    reader="$here/wave.mjs"
    if [ -f "$reader" ] && command -v node >/dev/null 2>&1; then
      node "$reader" "$waves/$stem.vcd" --log "$log" --bench "$bench" \
        --project "$project" $([ "$report" = 1 ] && printf -- --report) \
        ${RTLGRAPH_LANG:+--lang "$RTLGRAPH_LANG"} | sed 's/^/   /'
    else
      echo "   (dump written to waveform/$(basename -- "${bench%.*}").vcd; wave.mjs or node missing, so nothing read it)"
    fi
  fi

  # A bench that passed leaves nothing behind; one that failed keeps its logs,
  # which is exactly when anyone wants them.
  [ "$verdict" = PASS ] && [ "$keepbuild" = 0 ] && rm -rf "$work"
  rmdir "$out" 2>/dev/null || true

  note=""
  case "$rel" in tb/given/*) note="← the one it is marked with" ;; esac
  verdicts+=("$(printf '%-15s %-40s %s' "$verdict" "$rel" "$note")")
  echo
done

if [ "$keep" = 1 ] && [ -n "$placed" ]; then
  kept=$placed
  [ -z "$restore" ] || echo "note: ${restore#"$out"/} was moved aside to make room; put it back yourself."
  placed=""; restore=""   # the trap must leave it where it is
else
  unplace
  kept=""
fi

echo "────────────────────────────────────────"
for line in "${verdicts[@]}"; do echo "$line"; done
printf '%d bench(es), %d failing' "${#benches[@]}" "$failed"
[ "$silent" -eq 0 ] || printf ', %d with no PASS/FAIL line of its own — read its output above' "$silent"
# A bench that passed took its scratch with it, so pointing at an empty folder —
# or at one that is no longer there — reads as if something were left to look at.
if [ -d "$out" ] && [ -n "$(ls -A "$out" 2>/dev/null)" ]; then
  printf '.  artefacts in %s\n' "${out#"$project"/}"
else
  printf '\n'
fi
[ -z "$kept" ] || printf 'kept %s in the project folder (--keep).\n' "${kept#"$project"/}"
[ "$failed" -eq 0 ] || exit 1
