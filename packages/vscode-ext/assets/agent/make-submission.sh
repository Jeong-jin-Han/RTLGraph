#!/usr/bin/env bash
# RTLGraph — gather what is handed in, and zip it.
#
# The handout asks for one thing: the RTL, in the skeleton's own files, under
# the skeleton's own names. So that is the default: every .v in the project
# folder that is not a bench — **plus whatever those files need in order to
# elaborate**. A handed-out skeleton often instantiates a primitive it does not
# ship (a DFF, say); leaving it out hands in something that cannot be compiled,
# so it is pulled in from .base/ (or wherever the project defines it) and the
# report says which files were added and why.
#
# Everything else — your benches, the RTLGraph JSON, the handout itself — stays
# opt-in, because a marker who did not ask for it reads it as noise.
#
# The staging folder is rebuilt from scratch on every run, so what you see in
# submission/<name>/ is exactly what is in submission/<name>.zip. Nothing is
# copied out of it back into the project.
#
# Usage:
#   .agent/rtlgraph/make-submission.sh [<name>] [options]
#
#   <name>            zip base name (default: <project folder>_submission,
#                     e.g. P01_submission). With --id it becomes P01_<id>.
#   --id ID           student id, folded into the default name
#   --with-tb         also include tb/mine/ (additional benches)
#   --with-given      also include tb/given/ (the bench you are marked with)
#   --with-base       include all of .base/, not only what the design needs
#   --no-deps         do not add anything: hand in exactly the project's own .v
#   --with-rtlgraph   also include rtlgraph/ (RTLGraph JSON)
#   --with-pdf        also include the handout PDF
#   --all             everything above
#   --keep-tree       keep folders inside the zip (default: flat, all .v at top)
#   --out DIR         where the staging folder and zip go (default: <project>/submission)
#   --project DIR     the project root (default: the folder holding .agent)
#   --no-check        skip the iverilog elaboration check of what was collected
#   --list            print what would be collected and stop
#   -h, --help        this text
#
# Exit status is 0 only when the zip was written and it elaborates.

set -u

here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project=$(cd -- "$here/../.." && pwd)  # .agent/rtlgraph/<script> → the project
name=""
id=""
out=""
flat=1
check=1
list_only=0
with_tb=0
with_given=0
with_base=0
with_rtlgraph=0
with_pdf=0
deps=1

die() { printf '%s\n' "make-submission: $*" >&2; exit 1; }

while [ $# -gt 0 ]; do
    case "$1" in
        --id)            id=${2:-}; shift 2 || die "--id needs a value" ;;
        --out)           out=${2:-}; shift 2 || die "--out needs a directory" ;;
        --project)       project=${2:-}; shift 2 || die "--project needs a directory" ;;
        --with-tb)       with_tb=1; shift ;;
        --with-given)    with_given=1; shift ;;
        --with-base)     with_base=1; shift ;;
        --with-rtlgraph) with_rtlgraph=1; shift ;;
        --with-pdf)      with_pdf=1; shift ;;
        --no-deps)       deps=0; shift ;;
        --all)           with_tb=1; with_given=1; with_base=1; with_rtlgraph=1; with_pdf=1; shift ;;
        --keep-tree)     flat=0; shift ;;
        --no-check)      check=0; shift ;;
        --list)          list_only=1; shift ;;
        -h|--help)       sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        -*)              die "unknown option: $1" ;;
        *)               [ -z "$name" ] || die "more than one name given: $name, $1"; name=$1; shift ;;
    esac
done

project=$(cd -- "$project" 2>/dev/null && pwd) || die "no such project folder"
[ -d "$project/.agent/rtlgraph" ] || die "$project does not look like a project (no .agent/rtlgraph/)"

if [ -z "$name" ]; then
    base=$(basename -- "$project")
    if [ -n "$id" ]; then name="${base}_${id}"; else name="${base}_submission"; fi
fi
[ -n "$out" ] || out="$project/submission"

# ── collect ──────────────────────────────────────────────────────────────
# Each entry is "<source path>|<path inside the zip>". Folders keep their
# name even when the .v files are flattened, so tb/mine/ never collides with
# a design file of the same name.
entries=()
add_file() { entries+=("$1|$2"); }

add_dir() {  # add_dir <source dir> <name inside zip> <find expression...>
    local src=$1 as=$2; shift 2
    [ -d "$src" ] || return 0
    local f rel
    while IFS= read -r f; do
        rel=${f#"$src"/}
        add_file "$f" "$as/$rel"
    done < <(find "$src" -type f "$@" | sort)
}

# The deliverable: the skeleton's RTL, benches excluded.
while IFS= read -r f; do
    add_file "$f" "$(basename -- "$f")"
done < <(find "$project" -maxdepth 1 -type f \( -name '*.v' -o -name '*.sv' \) \
             ! -name 'tb_*' ! -name 'TB_*' | sort)

[ ${#entries[@]} -gt 0 ] || die "no RTL found directly in $project"

[ "$with_tb" = 1 ]       && add_dir "$project/tb/mine"  "tb/mine"  \( -name '*.v' -o -name '*.sv' \)
[ "$with_given" = 1 ]    && add_dir "$project/tb/given" "tb/given" \( -name '*.v' -o -name '*.sv' \)
[ "$with_base" = 1 ]     && add_dir "$project/.base"    "base"     \( -name '*.v' -o -name '*.sv' \)
[ "$with_rtlgraph" = 1 ] && add_dir "$project/rtlgraph" "rtlgraph" -name '*.json'
if [ "$with_pdf" = 1 ]; then
    while IFS= read -r f; do add_file "$f" "$(basename -- "$f")"; done \
        < <(find "$project" -maxdepth 1 -type f -name '*.pdf' | sort)
fi

# Flat is the default: markers open a zip, not a tree. Folder prefixes are
# dropped, but a name that would land twice keeps its folder so nothing is
# silently overwritten.
if [ "$flat" = 1 ]; then
    flattened=()
    for e in "${entries[@]}"; do
        src=${e%%|*}; dst=${e#*|}
        leaf=$(basename -- "$dst")
        clash=0
        for other in "${entries[@]}"; do
            [ "$other" = "$e" ] && continue
            [ "$(basename -- "${other#*|}")" = "$leaf" ] && { clash=1; break; }
        done
        [ "$clash" = 1 ] && flattened+=("$src|$dst") || flattened+=("$src|$leaf")
    done
    entries=("${flattened[@]}")
fi

# ── what the design needs to elaborate ───────────────────────────────────
# The handout's own files may instantiate a module the handout does not ship.
# Ask the compiler which ones are missing, find who defines them in this
# project, and add exactly those — repeating, since a primitive can need
# another one.
added=()
if [ "$deps" = 1 ] && command -v iverilog >/dev/null 2>&1; then
    provider() {  # provider <module> — the project file that declares it, .base/ first
        local module=$1 f
        for f in "$project/.base"/*.v "$project/.base"/*.sv; do
            [ -f "$f" ] || continue
            grep -qE "^[[:space:]]*module[[:space:]]+$module([[:space:]]|#|\(|$)" "$f" && { printf '%s' "$f"; return 0; }
        done
        while IFS= read -r f; do
            case "$(basename -- "$f")" in tb_*|TB_*|*_tb.v|*_tb.sv) continue ;; esac
            grep -qE "^[[:space:]]*module[[:space:]]+$module([[:space:]]|#|\(|$)" "$f" && { printf '%s' "$f"; return 0; }
        done < <(find "$project" \( -name .git -o -name node_modules -o -name submission -o -name build \
                     -o -name '*.sim' -o -name '*.cache' -o -name '*.runs' -o -name '*.hw' -o -name '*.ip_user_files' \) -prune -o \
                 \( -name '*.v' -o -name '*.sv' \) -print | sort)
        return 1
    }
    log=$(mktemp)
    for _round in 1 2 3 4 5 6 7 8; do
        sources=()
        for e in "${entries[@]}"; do sources+=("${e%%|*}"); done
        iverilog -g2005 -o /dev/null "${sources[@]}" >"$log" 2>&1 && break
        missing=$(sed -n 's/.*Unknown module type: \([A-Za-z_][A-Za-z0-9_$]*\).*/\1/p' "$log" | sort -u)
        [ -n "$missing" ] || break        # a real error, not a missing module: the check below reports it
        grew=0
        for module in $missing; do
            src=$(provider "$module") || continue
            case " ${entries[*]} " in *" $src|"*) continue ;; esac
            add_file "$src" "base/$(basename -- "$src")"
            added+=("$module ($(basename -- "$src"))")
            grew=1
        done
        [ "$grew" = 1 ] || break
    done
    rm -f -- "$log"
fi

if [ "$list_only" = 1 ]; then
    printf 'would collect into %s.zip:\n' "$name"
    for e in "${entries[@]}"; do printf '  %s\n' "${e#*|}"; done
    [ ${#added[@]} -eq 0 ] || printf 'added because the design does not elaborate without it: %s\n' "${added[*]}"
    exit 0
fi

# ── stage ────────────────────────────────────────────────────────────────
stage="$out/$name"
zipfile="$out/$name.zip"
case "$stage" in
    "$project"|"$project"/) die "refusing to stage over the project folder" ;;
esac
rm -rf -- "$stage" "$zipfile" || die "could not clear $stage"
mkdir -p -- "$stage" || die "could not create $stage"

for e in "${entries[@]}"; do
    src=${e%%|*}; dst=${e#*|}
    mkdir -p -- "$stage/$(dirname -- "$dst")"
    cp -p -- "$src" "$stage/$dst" || die "could not copy $src"
done

# ── check ───────────────────────────────────────────────────────────────
# A zip that does not elaborate is the one mistake worth catching here. After
# the pass above there should be nothing missing; if there still is, say so
# loudly rather than writing a quiet, broken submission.
status=0
if [ "$check" = 1 ] && command -v iverilog >/dev/null 2>&1; then
    log=$(mktemp)
    staged=()
    while IFS= read -r f; do staged+=("$f"); done \
        < <(find "$stage" -type f \( -name '*.v' -o -name '*.sv' \) | sort)
    if iverilog -g2005 -o /dev/null "${staged[@]}" >"$log" 2>&1; then
        printf 'elaboration    iverilog -g2005: ok\n'
        if [ ${#added[@]} -gt 0 ]; then
            printf 'added          %s\n' "${added[*]}"
            printf '               the handout instantiates these but does not ship them, so the zip\n'
            printf '               carries them. If the marking project has its own copy, hand in\n'
            printf '               without them: --no-deps.\n'
        fi
    else
        printf 'elaboration    iverilog -g2005: FAILED\n'
        sed 's/^/  /' "$log"
        printf '               (the zip was still written)\n'
        status=1
    fi
    rm -f -- "$log"
elif [ "$check" = 1 ]; then
    printf 'elaboration    skipped (no iverilog)\n'
fi

# ── zip ──────────────────────────────────────────────────────────────────
command -v zip >/dev/null 2>&1 || die "zip is not installed"
(cd -- "$out" && zip -r -q -X "$name.zip" "$name") || die "zip failed"

printf '\nsubmission     %s\n' "$zipfile"
printf 'staged in      %s\n' "$stage"
printf 'contents\n'
(cd -- "$stage" && find . -type f | sed 's|^\./|  |' | sort)
exit $status
