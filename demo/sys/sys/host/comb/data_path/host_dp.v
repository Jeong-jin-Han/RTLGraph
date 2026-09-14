`timescale 1ns / 1ps
`default_nettype none
// host_dp — next sample = current sample + 1
module host_dp (
    input  wire [5:0] CNT_Q,
    output wire [5:0] CNT_D
);

    INC #(5) u_inc (.a(CNT_Q), .y(CNT_D));

endmodule
`default_nettype wire
