# `.base` — the primitives RTLGraph draws with symbols

These six modules are the ones RTLGraph's registry has symbols for, so a box
whose `module` is one of them is drawn as that symbol (a register, an adder, a
mux) rather than as a plain box, and the validator checks its ports and widths
against the definition here.

| Module | What it is | Parameter |
|---|---|---|
| `DFF` | D flip-flop with enable and synchronous reset (`RST` beats `EN`) | `BW` — the **top bit index**, so the width is `BW+1` |
| `INC` | `+1` | `BW` |
| `ADD`, `SUB` | two-input add and subtract | `BW` |
| `MUX2` | 2-to-1 multiplexer | `BW` |
| `CMP_EQ` | equality compare, one-bit result | `BW` |

## Using them

A project that instantiates any of them needs the Verilog, or it will not
elaborate — a handed-out skeleton often assumes the course provides it. Point
the RTLGraph files at this folder:

```jsonc
"source": {
  "root": "..",              // where source.files are
  "lib": ".base",            // where these are, relative to root
  "libFiles": ["DFF.v"],     // the ones this file's design actually uses
  "files": ["uart.v", "uart_transmitter.v"],
  "top": "uart"
}
```

and hand the same files to your simulator:

```bash
iverilog -g2005 -o /tmp/a.vvp tb/tb_top.v src/*.v .base/*.v && vvp -n /tmp/a.vvp
xvlog src/*.v .base/*.v && xelab <top> -s snap && xsim snap -runall   # Vivado, no GUI
```

The validator reports `source-lib` when none of the `libFiles` are where `lib`
points, and says what `lib` should be.

## Changing them

They are yours once copied. Keep the port names and the meaning of `BW` if you
want the symbols and the width checks to keep working; everything else — the
reset style, the coding style — is a choice this copy makes and yours to change.
Then say so in the design's `diagnostics`, so the next reader knows the library
is no longer the stock one.
