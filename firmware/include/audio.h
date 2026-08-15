#pragma once
#include <Arduino.h>
#include <vector>

bool audioBegin();
void audioEnd();

// Record up to maxMs of 16-bit mono PCM @ SAMPLE_RATE_HZ into out (heap/PSRAM).
bool audioRecord(std::vector<int16_t> &out, uint32_t maxMs, uint32_t silenceTimeoutMs = 1200);

// Streaming playback of 16-bit mono PCM. Chunks are written to I2S as they
// arrive so a full clip never has to fit in RAM.
bool audioPlayBegin(uint32_t sampleRateHz);
// volumePercent attenuates before the MAX98357A's fixed hardware gain. Lower it
// if speech peaks distort on a USB-powered rail.
bool audioPlayWrite(const int16_t *data, size_t samples, void (*onLevel)(float) = nullptr,
                    int volumePercent = 100);
void audioPlayEnd(void (*onLevel)(float) = nullptr);

// Build a WAV blob in memory (header + PCM) for Whisper upload.
bool audioMakeWav(const std::vector<int16_t> &pcm, std::vector<uint8_t> &wavOut);
