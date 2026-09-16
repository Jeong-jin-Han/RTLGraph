`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// cnt_top — an 8-bit down counter with a zero flag. LOAD takes
//   LOAD_VAL, DEC counts one down, and RST clears it to zero (which
//   is also what ZERO reports).
//------------------------------------------------------------------
module cnt_top (
    input  wire       CLK,
    input  wire       RST,
    input  wire       LOAD,
    input  wire       DEC,
    input  wire [7:0] LOAD_VAL,
    output wire [7:0] VAL,
    output wire       ZERO
);

    wire [7:0] CNT_D;
    wire       CNT_EN;
    wire       CNT_SEL;

    // Data-path
    cnt_dp data_path (
        .VAL      (VAL),
        .LOAD_VAL (LOAD_VAL),
        .CNT_SEL  (CNT_SEL),
        .CNT_D    (CNT_D),
        .ZERO     (ZERO)
    );

    // Control-path
    cnt_cp control_path (
        .LOAD    (LOAD),
        .DEC     (DEC),
        .CNT_EN  (CNT_EN),
        .CNT_SEL (CNT_SEL)
    );

    // Registers
    DFF #(7) CNT_FF (
        .CLK (CLK),
        .RST (RST),
        .EN  (CNT_EN),
        .D   (CNT_D),
        .Q   (VAL)
    );

endmodule
`default_nettype wire
