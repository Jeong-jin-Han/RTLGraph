`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// updown_dp — data path of the up/down counter (combinational, no clock)
//   STEP_OUT = DIR_SEL  ? INC(CNT_Q) : SUB(CNT_Q, 1)
//   CNT_D    = LOAD_SEL ? DIN        : STEP_OUT
//------------------------------------------------------------------
module updown_dp (
    input  wire [5:0] CNT_Q,
    input  wire [5:0] DIN,
    input  wire       DIR_SEL,   // 0 = decrement, 1 = increment
    input  wire       LOAD_SEL,  // 0 = step, 1 = load DIN
    output wire [5:0] CNT_D
);

wire [5:0] INC_OUT;
wire [5:0] DEC_OUT;
wire [5:0] STEP_OUT;

// @sch: group="next_count"
INC #(.BW(5)) u_inc (
    .a (CNT_Q),
    .y (INC_OUT)
);

SUB #(.BW(5)) u_dec (
    .a (CNT_Q),
    .b (6'd1),
    .y (DEC_OUT)
);

MUX2 #(.BW(5)) u_mux_dir (
    .sel (DIR_SEL),
    .d0  (DEC_OUT),
    .d1  (INC_OUT),
    .y   (STEP_OUT)
);

MUX2 #(.BW(5)) u_mux_load (
    .sel (LOAD_SEL),
    .d0  (STEP_OUT),
    .d1  (DIN),
    .y   (CNT_D)
);

endmodule
`default_nettype wire
