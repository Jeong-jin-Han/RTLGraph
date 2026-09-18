`timescale 1ns / 1ps
//------------------------------------------------------------------
// hw_top — skeleton as handed out: one flat folder, names fixed.
//   Counts while EN is high and clears itself at LIMIT.
//------------------------------------------------------------------
module hw_top (
    input  wire       CLK,
    input  wire       nRST,
    input  wire       EN,
    input  wire [3:0] LIMIT,
    output wire [3:0] CNT,
    output wire       DONE
);

    wire [3:0] cnt_q;
    wire       clear;

    counter u_counter (
        .CLK  (CLK),
        .nRST (nRST),
        .EN   (EN),
        .CLR  (clear),
        .Q    (cnt_q)
    );

    assign clear = (cnt_q == LIMIT);
    assign CNT   = cnt_q;
    assign DONE  = clear;

endmodule
