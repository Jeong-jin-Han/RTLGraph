`timescale 1ns / 1ps
`default_nettype none
//------------------------------------------------------------------
// updown_cp — control path of the up/down counter (combinational, no clock)
//   Priority: RST > LOAD > EN
//------------------------------------------------------------------
module updown_cp (
    input  wire RST,
    input  wire LOAD,
    input  wire EN,
    input  wire UP,
    // @sch: meaning="1=clear counter to 0"
    output reg  CNT_RST,
    // @sch: meaning="0=hold, 1=update counter"
    output reg  CNT_EN,
    // @sch: meaning="0=step (INC/SUB), 1=load DIN"
    output reg  LOAD_SEL,
    // @sch: meaning="0=decrement (SUB), 1=increment (INC)"
    output reg  DIR_SEL
);

always @(*) begin
    casex ({RST, LOAD, EN, UP})
        4'b1xxx: {CNT_RST, CNT_EN, LOAD_SEL, DIR_SEL} = 4'b1000;  // reset
        4'b01xx: {CNT_RST, CNT_EN, LOAD_SEL, DIR_SEL} = 4'b0110;  // load DIN
        4'b0010: {CNT_RST, CNT_EN, LOAD_SEL, DIR_SEL} = 4'b0100;  // count down
        4'b0011: {CNT_RST, CNT_EN, LOAD_SEL, DIR_SEL} = 4'b0101;  // count up
        4'b000x: {CNT_RST, CNT_EN, LOAD_SEL, DIR_SEL} = 4'b0000;  // hold
        default: {CNT_RST, CNT_EN, LOAD_SEL, DIR_SEL} = 4'b0000;
    endcase
end

endmodule
`default_nettype wire
