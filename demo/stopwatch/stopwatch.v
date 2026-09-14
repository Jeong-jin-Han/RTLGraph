`timescale 1ns / 1ps

// Two-digit stopwatch: start / stop (pause) / clear buttons.
module stopwatch (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       btn_start,
    input  wire       btn_stop,
    input  wire       btn_clear,
    output wire [3:0] ones,
    output wire [3:0] tens,
    output wire       running
);

    localparam IDLE  = 2'd0,
               RUN   = 2'd1,
               PAUSE = 2'd2;

    reg  [1:0] state, next_state;
    wire       tick;
    wire       clr;
    wire       inc0;
    wire       carry0;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= IDLE;
        else        state <= next_state;
    end

    always @(*) begin
        next_state = state;
        case (state)
            IDLE:    if (btn_start) next_state = RUN;
            RUN:     if (btn_stop)  next_state = PAUSE;
            PAUSE:   if (btn_start) next_state = RUN;
                     else if (btn_clear) next_state = IDLE;
            default: next_state = IDLE;
        endcase
    end

    assign running = (state == RUN);
    assign clr     = (state == IDLE);
    assign inc0    = running & tick;

    tick_gen #(4) u_tick (clk, rst_n, tick);

    bcd_digit u_ones (.clk(clk), .rst_n(rst_n), .clr(clr), .inc(inc0),   .q(ones), .carry(carry0));
    bcd_digit u_tens (.clk(clk), .rst_n(rst_n), .clr(clr), .inc(carry0), .q(tens), .carry());

endmodule
