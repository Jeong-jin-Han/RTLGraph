`timescale 1ns / 1ps
// tb_hw — the testbench handed out with the skeleton, self-checking.
module tb_hw;

    reg        CLK = 1'b0;
    reg        nRST = 1'b0;
    reg        EN = 1'b0;
    reg  [3:0] LIMIT = 4'd5;
    wire [3:0] CNT;
    wire       DONE;

    integer seen = 0;
    integer errors = 0;
    integer i;

    hw_top dut (.CLK (CLK), .nRST (nRST), .EN (EN), .LIMIT (LIMIT), .CNT (CNT), .DONE (DONE));

    always #5 CLK = ~CLK;

    initial begin
        @(posedge CLK); #1;
        if (CNT !== 4'd0) begin errors = errors + 1; $display("FAIL: reset leaves CNT at %0d", CNT); end
        nRST = 1'b1;
        EN = 1'b1;
        for (i = 0; i < 24; i = i + 1) begin
            @(posedge CLK); #1;
            if (DONE === 1'b1) begin
                seen = seen + 1;
                if (CNT !== LIMIT) begin errors = errors + 1; $display("FAIL: DONE at %0d", CNT); end
            end
        end
        if (seen != 4) begin errors = errors + 1; $display("FAIL: %0d limits in 24 cycles, expected 4", seen); end
        if (errors == 0) $display("PASS: reached the limit %0d times, 0 mismatches", seen);
        else $display("FAIL: %0d mismatch(es)", errors);
        $finish;
    end

endmodule
