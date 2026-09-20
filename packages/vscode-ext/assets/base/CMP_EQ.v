`timescale 1ns / 1ps
`default_nettype none
// CMP_EQ — 같음 비교.  y = (a == b)
module CMP_EQ #(parameter BW = 5) (
    input  wire [BW:0] a,
    input  wire [BW:0] b,
    output wire        y
);
assign y = (a == b);
endmodule
`default_nettype wire
