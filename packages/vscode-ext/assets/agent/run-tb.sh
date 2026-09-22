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
#   --wave          also dump a waveform and write what it says (waveform/…md)
#                   RTLGRAPH_LANG=ko writes that report in Korean
#   --keep          leave the last bench swapped into the project folder
#   --in-place      do not swap anything; compile the benches where they lie
#   --quiet         only the verdict lines, no simulator output
#   -h, --help      this text
#
# With --wave the bench is never edited to make it dump: a small module beside
# it calls $dumpvars, and .agent/rtlgraph/wave.mjs turns the dump into
# <project>/waveform/<bench>.waveform.{json,md} — measurements only, kept with
# the project rather than among the tools. The "why did this pass?" reading is a
# separate job, for .prompt/rtlgraph/waveform/*.md.
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
want=()

while [ $# -gt 0 ]; do
  case "$1" in
    --project) project=$(cd -- "$2" && pwd); shift 2 ;;
    --sim) sim="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    --top) top="$2"; shift 2 ;;
    --wave) wave=1; shift ;;
    --keep) keep=1; shift ;;
    --in-place) swap=0; shift ;;
    --quiet) quiet=1; shift ;;
    -h|--help) sed -n '2,34p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
  find "$project" \( -name .git -o -name node_modules -o -name 'xsim.dir' -o -path "$out" \
    -o -path "$project/tb/given" -o -path "$project/tb/mine" \) -prune -o \
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
    -o -name '*.sim' -o -name '*.cache' -o -name '*.runs' -o -name '*.hw' -o -name '*.ip_user_files' \) -prune -o \
  \( -name '*.v' -o -name '*.sv' \) -print | sort -t/ -k1 | awk '{print gsub(/\//,"/") "\t" $0}' | sort -n | cut -f2-)

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
module_of() { sed -n 's/^[[:space:]]*module[[:space:]]\+\([A-Za-z_][A-Za-z0-9_$]*\).*/\1/p' "$1" | head -1; }

# A .v bench is Verilog-2005 until it proves otherwise: compiling it as
# SystemVerilog turns words like `expect` into keywords and breaks a bench that
# was fine. So try the plain dialect first and widen only if it fails.
dialects_for() { case "$1" in *.sv) echo "-g2012" ;; *) echo "-g2005 -g2005-sv -g2012" ;; esac; }

# A module that dumps, compiled alongside a bench that was never asked to. The
# bench keeps its own file untouched — which matters most for the one bench we
# are not allowed to edit.
dumper_for() { # bench, workdir → prints the file to compile with it, or nothing
  local bench=$1 work=$2 top
  [ "$wave" = 1 ] || return 0
  top=${top:-$(module_of "$bench")}
  cat > "$work/rtlgraph_dumper.v" <<DUMPER
module rtlgraph_dumper;
    initial begin
        \$dumpfile("$work/wave.vcd");
        \$dumpvars(0, $top);
    end
endmodule
DUMPER
  printf '%s' "$work/rtlgraph_dumper.v"
}

run_iverilog() { # bench, workdir
  local bench=$1 work=$2 first="" tried="" dump
  dump=$(dumper_for "$bench" "$work")
  for dialect in $(dialects_for "$bench"); do
    if iverilog "$dialect" -o "$work/a.out" "$bench" "${sources[@]}" ${dump:+"$dump"} > "$work/compile.$dialect.log" 2>&1; then
      cat "$work/compile.$dialect.log"
      ( cd -- "$project" && vvp -n "$work/a.out" )
      return
    fi
    [ -n "$first" ] || first="$work/compile.$dialect.log"
    tried="$tried $dialect"
  done
  cat "$first"
  echo "(iverilog: none of$tried compiled it; the errors above are the first of them)"
  return 9
}

run_vivado() { # bench, workdir
  local bench=$1 work=$2 unit mode=""
  unit=${top:-$(module_of "$bench")}
  case "$bench" in *.sv) mode="--sv" ;; esac
  ( cd -- "$work" && xvlog $mode "$bench" "${sources[@]}" > compile.log 2>&1 \
      && xelab -debug typical "$unit" -s tb_snapshot >> compile.log 2>&1 ) || { cat "$work/compile.log"; return 9; }
  ( cd -- "$work" && xsim tb_snapshot -runall )
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

  if [ "$sim" = vivado ]; then run_vivado "$active" "$work" > "$log" 2>&1; status=$?
  else run_iverilog "$active" "$work" > "$log" 2>&1; status=$?; fi
  [ "$quiet" = 1 ] || sed 's/^/   /' "$log"

  # A bench decides its own verdict; we only read it. Anything that says FAIL,
  # ERROR, or a non-zero mismatch count has failed, whatever else it printed.
  if [ $status -eq 9 ]; then verdict="DID NOT COMPILE"
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
    waves="$project/waveform"
    mkdir -p "$waves"
    mv -f "$work/wave.vcd" "$waves/$(basename -- "${bench%.*}").vcd"
    reader="$here/wave.mjs"
    if [ -f "$reader" ] && command -v node >/dev/null 2>&1; then
      node "$reader" "$waves/$(basename -- "${bench%.*}").vcd" --log "$log" --bench "$bench" \
        --project "$project" ${RTLGRAPH_LANG:+--lang "$RTLGRAPH_LANG"} | sed 's/^/   /'
    else
      echo "   (dump written to waveform/$(basename -- "${bench%.*}").vcd; wave.mjs or node missing, so nothing read it)"
    fi
  fi

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
printf '.  artefacts in %s\n' "${out#"$project"/}"
[ -z "$kept" ] || printf 'kept %s in the project folder (--keep).\n' "${kept#"$project"/}"
[ "$failed" -eq 0 ] || exit 1
