#pragma once

// GPIO map — must match wiring.html / flash page defaults
#define PIN_I2S_MIC_SD    8
#define PIN_I2S_MIC_WS    9
#define PIN_I2S_MIC_SCK   10

#define PIN_I2S_SPK_DOUT  11
#define PIN_I2S_SPK_WS    12
#define PIN_I2S_SPK_BCLK  13

#define PIN_MOTOR_IN1     16
#define PIN_MOTOR_IN2     17
#define PIN_MOTOR_IN3     4
#define PIN_MOTOR_IN4     5

#define PIN_TALK_BTN      14

#define I2S_MIC_PORT      I2S_NUM_0
#define I2S_SPK_PORT      I2S_NUM_1

#define SAMPLE_RATE_HZ    16000
#define TTS_SAMPLE_RATE   24000
