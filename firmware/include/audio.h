#pragma once
#include <Arduino.h>
#include <vector>

bool audioBegin();
void audioEnd();

// Record up to maxMs of 16-bit mono PCM @ SAMPLE_RATE_HZ into out (heap/PSRAM).
bool audioRecord(std::vector<int16_t> &out, uint32_t maxMs, uint32_t silenceTimeoutMs = 1200);

// Play 16-bit mono PCM at sampleRateHz, invoking onLevel(0..1) for lip sync.
bool audioPlayPcm(const int16_t *data, size_t samples, uint32_t sampleRateHz,
                  void (*onLevel)(float) = nullptr);

// Build a WAV blob in memory (header + PCM) for Whisper upload.
bool audioMakeWav(const std::vector<int16_t> &pcm, std::vector<uint8_t> &wavOut);
