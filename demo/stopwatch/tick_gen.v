`timescale 1ns / 1ps

// One-cycle tick every DIV clock cycles.
module tick_gen #(parameter DIV = 4) (
    input  wire clk,
    input  wire rst_n,
    output wire tick
);

    reg [3:0] cnt;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)              cnt <= 4'd0;
        else if (cnt == DIV - 1) cnt <= 4'd0;
        else                     cnt <= cnt + 4'd1;
    end

    assign tick = (cnt == DIV - 1);

endmodule
