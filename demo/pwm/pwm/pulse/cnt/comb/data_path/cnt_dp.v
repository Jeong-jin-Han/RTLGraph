`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// cnt_dp — the down counter's data-path: the value one below the
//   current one, the reload value beside it, and the zero flag
//------------------------------------------------------------------
module cnt_dp (
    input  wire [7:0] VAL,
    input  wire [7:0] LOAD_VAL,
    input  wire       CNT_SEL,

    output wire [7:0] CNT_D,
    output wire       ZERO
);

    wire [7:0] DOWN;

    SUB #(7) u_sub (
        .a (VAL),
        .b (8'd1),
        .y (DOWN)
    );

    MUX2 #(7) u_mux (
        .sel (CNT_SEL),
        .d0  (DOWN),
        .d1  (LOAD_VAL),
        .y   (CNT_D)
    );

    CMP_EQ #(7) u_zero (
        .a (VAL),
        .b (8'd0),
        .y (ZERO)
    );

endmodule
`default_nettype wire
