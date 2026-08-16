#pragma once
#include <Arduino.h>

void motorsBegin();
void motorsStop();
void mouthOpen();
void mouthClose();
void tailFlop();
void motorsSelfTest();             // mouth then tail — serial 'M'
void motorsLipSync(float level01); // 0..1 audio energy
void motorsTick();                 // call from loop for timed flop
