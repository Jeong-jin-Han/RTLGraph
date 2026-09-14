`timescale 1ns / 1ps
// TB_sys — drives on the falling edge, prints on the rising edge
module TB_sys;

    reg        CLK   = 1'b0;
    reg        RST   = 1'b1;
    reg        START = 1'b0;
    wire [5:0] SUM;

    sys_top dut (.CLK(CLK), .RST(RST), .START(START), .SUM(SUM));

    always #5 CLK = ~CLK;

    initial begin
        repeat (2) @(negedge CLK);
        RST = 1'b0;
        @(negedge CLK);
        START = 1'b1;
        repeat (8) @(negedge CLK);
        START = 1'b0;
        repeat (3) @(negedge CLK);
        $finish;
    end

    always @(posedge CLK)
        $display("%4t RST=%b START=%b DATA=%2d VALID=%b SUM=%2d", $time, RST, START, dut.DATA, dut.VALID, SUM);

endmodule
