`timescale 1ns / 1ps
//------------------------------------------------------------------
// counter — 4-bit up counter. nRST is asynchronous and active low;
//   CLR clears it on the next edge; EN lets it count.
//------------------------------------------------------------------
module counter (
    input  wire       CLK,
    input  wire       nRST,
    input  wire       EN,
    input  wire       CLR,
    output reg  [3:0] Q
);

    always @(posedge CLK or negedge nRST) begin
        if (!nRST)     Q <= 4'd0;
        else if (CLR)  Q <= 4'd0;
        else if (EN)   Q <= Q + 1'b1;
    end

endmodule
