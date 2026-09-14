`timescale 1ns / 1ps

// One BCD digit 0..9 with synchronous clear and a carry out on wrap.
module bcd_digit (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       clr,
    input  wire       inc,
    output reg  [3:0] q,
    output wire       carry
);

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)   q <= 4'd0;
        else if (clr) q <= 4'd0;
        else if (inc) q <= (q == 4'd9) ? 4'd0 : q + 4'd1;
    end

    assign carry = inc & (q == 4'd9);

endmodule
