`timescale 1ns / 1ps
// TB_sys — drives on the falling edge, prints on the rising edge, and checks the
// running sum it should have reached: the host sends 0, 1, 2, … and the device
// adds each one a cycle after it arrives.
module TB_sys;

    reg        CLK   = 1'b0;
    reg        RST   = 1'b1;
    reg        START = 1'b0;
    wire [5:0] SUM;

    sys_top dut (.CLK(CLK), .RST(RST), .START(START), .SUM(SUM));

    always #5 CLK = ~CLK;

    integer errors = 0;

    initial begin
        repeat (2) @(negedge CLK);
        RST = 1'b0;
        @(negedge CLK);
        START = 1'b1;
        repeat (8) @(negedge CLK);
        START = 1'b0;
        repeat (3) @(negedge CLK);
        // 0+1+2+3+4+5+6 = 21: the last sample the host sent never reaches the sum,
        // because START went low the cycle it was buffered.
        if (SUM !== 6'd21) begin
            errors = errors + 1;
            $display("FAIL: the sum ended at %0d, expected 21", SUM);
        end
        if (errors == 0) $display("PASS: the sum reached %0d, 0 mismatches", SUM);
        else $display("FAIL: %0d mismatch(es)", errors);
        $finish;
    end

    always @(posedge CLK)
        $display("%4t RST=%b START=%b DATA=%2d VALID=%b SUM=%2d", $time, RST, START, dut.DATA, dut.VALID, SUM);

endmodule
