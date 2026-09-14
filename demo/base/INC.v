`timescale 1ns / 1ps
`default_nettype none
// INC — 1 증가.  y = a + 1
module INC #(parameter BW = 5) (
    input  wire [BW:0] a,
    output wire [BW:0] y
);
assign y = a + 1'b1;
endmodule
`default_nettype wire
