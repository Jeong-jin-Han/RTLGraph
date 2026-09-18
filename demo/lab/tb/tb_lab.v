`timescale 1ns / 1ps
// tb_lab — shifts in 8'hA5 and checks the match and the parity that goes with it.
module tb_lab;

    reg        clk = 1'b0;
    reg        rst = 1'b1;
    reg        en = 1'b0;
    reg        din = 1'b0;
    wire [7:0] data;
    wire       parity;
    wire       match;

    integer errors = 0;
    integer i;
    reg [7:0] pattern = 8'hA5;

    lab_top dut (.clk (clk), .rst (rst), .en (en), .din (din), .data (data), .parity (parity), .match (match));

    always #5 clk = ~clk;

    initial begin
        @(posedge clk); #1;
        rst = 1'b0;
        en = 1'b1;
        for (i = 7; i >= 0; i = i - 1) begin
            din = pattern[i];
            @(posedge clk); #1;
        end
        if (data !== pattern) begin errors = errors + 1; $display("FAIL: shifted in %h, not %h", data, pattern); end
        if (match !== 1'b1) begin errors = errors + 1; $display("FAIL: the pattern is in but match is %b", match); end
        if (parity !== ^pattern) begin errors = errors + 1; $display("FAIL: parity %b, expected %b", parity, ^pattern); end
        en = 1'b0;
        @(posedge clk); #1;
        if (data !== pattern) begin errors = errors + 1; $display("FAIL: it moved while en was low"); end
        if (errors == 0) $display("PASS: shifted in %h, match=%b parity=%b, 0 mismatches", data, match, parity);
        else $display("FAIL: %0d mismatch(es)", errors);
        $finish;
    end

endmodule
