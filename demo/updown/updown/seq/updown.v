`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// updown — 6-bit up/down counter with synchronous load
//   Priority: RST > LOAD > EN.  UP=1 counts up, UP=0 counts down.
//   Component top: DFF instances and wiring only (the clock boundary).
//------------------------------------------------------------------
module updown (
    input  wire       CLK,
    input  wire       RST,     // active-high, synchronous
    input  wire       EN,      // count enable
    input  wire       UP,      // 1 = increment, 0 = decrement
    input  wire       LOAD,    // load DIN into the counter
    input  wire [5:0] DIN,
    output wire [5:0] CNT
);

// Counter register nets
wire [5:0] CNT_D;
wire [5:0] CNT_Q;

// Control nets
// @sch: meaning="1=clear counter to 0"
wire       CNT_RST;
// @sch: meaning="0=hold, 1=update counter"
wire       CNT_EN;
// @sch: meaning="0=step (INC/SUB), 1=load DIN"
wire       LOAD_SEL;
// @sch: meaning="0=decrement (SUB), 1=increment (INC)"
wire       DIR_SEL;

// Control path: decodes RST/LOAD/EN/UP into register and select controls
updown_cp control_path (
    .RST      (RST),
    .LOAD     (LOAD),
    .EN       (EN),
    .UP       (UP),
    .CNT_RST  (CNT_RST),
    .CNT_EN   (CNT_EN),
    .LOAD_SEL (LOAD_SEL),
    .DIR_SEL  (DIR_SEL)
);

// Data path: next count (increment / decrement / load)
updown_dp data_path (
    .CNT_Q    (CNT_Q),
    .DIN      (DIN),
    .DIR_SEL  (DIR_SEL),
    .LOAD_SEL (LOAD_SEL),
    .CNT_D    (CNT_D)
);

// Counter register
DFF #(.BW(5)) CNT_FF (
    .CLK (CLK),
    .RST (CNT_RST),
    .EN  (CNT_EN),
    .D   (CNT_D),
    .Q   (CNT_Q)
);

assign CNT = CNT_Q;

endmodule
`default_nettype wire
