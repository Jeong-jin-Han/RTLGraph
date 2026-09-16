`timescale 1ns / 1ps
//------------------------------------------------------------------
// TB_pwm — self-checking. Runs the core at PERIOD=8 / DUTY=3, counts
//   the high cycles of four whole periods, and checks that RDY is low
//   exactly while the core is activated.
//------------------------------------------------------------------
module TB_pwm;

    reg         CLK = 1'b0;
    reg         RST = 1'b1;
    reg  [7:0]  PERIOD = 8'd8;
    reg  [7:0]  DUTY = 8'd3;
    reg         SET = 1'b0;
    reg         STOP = 1'b0;
    wire        PWM;
    wire        RDY;

    integer high_cycles = 0;
    integer total_cycles = 0;
    integer errors = 0;
    integer i;

    pwm_top dut (
        .CLK (CLK), .RST (RST), .PERIOD (PERIOD), .DUTY (DUTY),
        .SET (SET), .STOP (STOP), .PWM (PWM), .RDY (RDY)
    );

    always #5 CLK = ~CLK;

    task step;
        begin
            @(posedge CLK);
            #1;
        end
    endtask

    task check(input cond, input [8*40:1] what);
        begin
            if (!cond) begin
                errors = errors + 1;
                $display("FAIL at %0t: %0s", $time, what);
            end
        end
    endtask

    initial begin
        step; step;
        check(RDY === 1'b1, "RDY is high while idle");
        check(PWM === 1'b0, "PWM is low while idle");
        RST = 1'b0;
        step;

        // Activate: one cycle of SET
        SET = 1'b1;
        step;
        SET = 1'b0;
        step;              // LOAD
        step;              // the first running cycle primes the counter
        check(RDY === 1'b0, "RDY is low once the core is activated");

        // Four whole periods: 4 * 8 = 32 cycles, 4 * 3 = 12 of them high
        for (i = 0; i < 32; i = i + 1) begin
            step;
            total_cycles = total_cycles + 1;
            if (PWM === 1'b1) high_cycles = high_cycles + 1;
        end
        check(high_cycles == 12, "3 of every 8 cycles are high");
        check(total_cycles == 32, "32 cycles were watched");

        // Stop: one cycle of STOP
        STOP = 1'b1;
        step;
        STOP = 1'b0;
        step; step;
        check(PWM === 1'b0, "PWM is low after STOP");
        check(RDY === 1'b1, "RDY is high again after STOP");

        if (errors == 0) $display("PASS: %0d high of %0d cycles, 0 mismatches", high_cycles, total_cycles);
        else $display("FAIL: %0d mismatch(es)", errors);
        $finish;
    end

endmodule
