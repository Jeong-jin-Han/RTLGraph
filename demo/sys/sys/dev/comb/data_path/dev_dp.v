`timescale 1ns / 1ps
`default_nettype none
// dev_dp — next sum = current sum + buffered sample
module dev_dp (
    input  wire [5:0] SUM_Q,
    input  wire [5:0] BUF_OUT,
    output wire [5:0] SUM_D
);

    ADD #(5) u_add (.a(SUM_Q), .b(BUF_OUT), .y(SUM_D));

endmodule
`default_nettype wire
