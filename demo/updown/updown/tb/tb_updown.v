`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// tb_updown — self-checking testbench for updown
//   Inputs are driven on the falling edge; outputs are sampled and
//   printed on the rising edge (no drive/sample race).
//------------------------------------------------------------------
module tb_updown;

reg        CLK  = 1'b0;
reg        RST  = 1'b1;
reg        EN   = 1'b0;
reg        UP   = 1'b0;
reg        LOAD = 1'b0;
reg  [5:0] DIN  = 6'd0;
wire [5:0] CNT;

reg  [5:0] exp_cnt;
integer    cycle  = 0;
integer    errors = 0;
integer    seed   = 32'h1234_5678;
integer    r;
integer    i;

updown dut (
    .CLK  (CLK),
    .RST  (RST),
    .EN   (EN),
    .UP   (UP),
    .LOAD (LOAD),
    .DIN  (DIN),
    .CNT  (CNT)
);

always #5 CLK = ~CLK;

// Sample and check on the rising edge, then advance the reference model
always @(posedge CLK) begin
    if (cycle > 0) begin
        $display("%4d RST=%b LOAD=%b EN=%b UP=%b DIN=%2d | CNT=%2d exp=%2d%s",
                 cycle, RST, LOAD, EN, UP, DIN, CNT, exp_cnt,
                 (CNT !== exp_cnt) ? "  <-- MISMATCH" : "");
        if (CNT !== exp_cnt) errors = errors + 1;
    end
    cycle = cycle + 1;
    if (RST)       exp_cnt <= 6'd0;
    else if (LOAD) exp_cnt <= DIN;
    else if (EN)   exp_cnt <= UP ? exp_cnt + 6'd1 : exp_cnt - 6'd1;
end

task drive(input rst, input load, input en, input up, input [5:0] din, input integer n);
    integer k;
    begin
        for (k = 0; k < n; k = k + 1) begin
            @(negedge CLK);
            RST = rst; LOAD = load; EN = en; UP = up; DIN = din;
        end
    end
endtask

initial begin
    //     RST LOAD EN UP DIN    cycles
    drive(1, 1, 1, 1, 6'd33, 2);   // RST beats LOAD and EN
    drive(0, 0, 1, 1, 6'd0,  5);   // count up 0 -> 5
    drive(0, 0, 1, 0, 6'd0,  8);   // count down 5 -> 61 (wraps)
    drive(0, 0, 0, 1, 6'd0,  3);   // hold
    drive(0, 1, 0, 0, 6'd62, 1);   // LOAD works with EN=0
    drive(0, 0, 1, 1, 6'd0,  3);   // count up 62 -> 1 (wraps)
    drive(0, 1, 1, 0, 6'd10, 1);   // LOAD beats EN
    drive(0, 0, 1, 0, 6'd0,  2);   // count down 10 -> 8
    drive(1, 1, 1, 1, 6'd20, 1);   // RST beats LOAD
    drive(0, 0, 0, 0, 6'd0,  2);   // hold at 0
    // Random stimulus ($random with a seed is defined by IEEE 1364)
    for (i = 0; i < 200; i = i + 1) begin
        r = $random(seed);
        drive(r[3:0] == 4'd0, r[7:5] == 3'd0, r[8], r[9], r[15:10], 1);
    end
    drive(0, 0, 0, 0, 6'd0, 2);
    if (errors == 0) $display("PASS: %0d cycles, 0 mismatches", cycle - 1);
    else             $display("FAIL: %0d mismatches", errors);
    $finish;
end

endmodule
`default_nettype wire
