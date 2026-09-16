`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// pulse_dp — how long each half of the wave lasts. A phase of N
//   cycles is counted as N-1 down to zero, so each length is one
//   below the number of cycles it stands for.
//------------------------------------------------------------------
module pulse_dp (
    input  wire [7:0] PERIOD,
    input  wire [7:0] DUTY,
    input  wire       LOAD_HIGH,

    output wire [7:0] RELOAD
);

    wire [7:0] OFF;       // PERIOD - DUTY: the cycles the wave is low
    wire [7:0] HIGH_LEN;
    wire [7:0] LOW_LEN;

    SUB #(7) u_off (
        .a (PERIOD),
        .b (DUTY),
        .y (OFF)
    );

    SUB #(7) u_high (
        .a (DUTY),
        .b (8'd1),
        .y (HIGH_LEN)
    );

    SUB #(7) u_low (
        .a (OFF),
        .b (8'd1),
        .y (LOW_LEN)
    );

    MUX2 #(7) u_mux (
        .sel (LOAD_HIGH),
        .d0  (LOW_LEN),
        .d1  (HIGH_LEN),
        .y   (RELOAD)
    );

endmodule
`default_nettype wire
