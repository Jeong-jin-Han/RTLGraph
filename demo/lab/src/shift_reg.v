`timescale 1ns / 1ps
// shift_reg — 8-bit serial-in, parallel-out, synchronous clear.
module shift_reg (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    input  wire       din,
    output reg  [7:0] q
);

    always @(posedge clk) begin
        if (rst)     q <= 8'd0;
        else if (en) q <= {q[6:0], din};
    end

endmodule
