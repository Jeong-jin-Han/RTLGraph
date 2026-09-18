`timescale 1ns / 1ps
// lab_top — shifts a bit stream in and reports its parity and a pattern match.
module lab_top (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    input  wire       din,
    output wire [7:0] data,
    output wire       parity,
    output wire       match
);

    wire [7:0] q;

    shift_reg u_shift (
        .clk (clk),
        .rst (rst),
        .en  (en),
        .din (din),
        .q   (q)
    );

    assign data   = q;
    assign parity = ^q;
    assign match  = (q == 8'hA5);

endmodule
