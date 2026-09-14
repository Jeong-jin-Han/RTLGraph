`timescale 1ns / 1ps

module tb_stopwatch;

    reg  clk = 0, rst_n = 0;
    reg  btn_start = 0, btn_stop = 0, btn_clear = 0;
    wire [3:0] ones, tens;
    wire running;

    stopwatch dut (
        .clk(clk), .rst_n(rst_n),
        .btn_start(btn_start), .btn_stop(btn_stop), .btn_clear(btn_clear),
        .ones(ones), .tens(tens), .running(running)
    );

    always #5 clk = ~clk;

    initial begin
        repeat (2) @(negedge clk);
        rst_n = 1;
        @(negedge clk) btn_start = 1;
        @(negedge clk) btn_start = 0;
        repeat (50) @(negedge clk);
        @(negedge clk) btn_stop = 1;
        @(negedge clk) btn_stop = 0;
        repeat (5) @(negedge clk);
        @(negedge clk) btn_clear = 1;
        @(negedge clk) btn_clear = 0;
        repeat (3) @(negedge clk);
        $finish;
    end

    always @(posedge clk)
        $display("%4t running=%b time=%0d%0d", $time, running, tens, ones);

endmodule
