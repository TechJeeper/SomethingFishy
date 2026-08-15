#pragma once
#include <Arduino.h>
#include <vector>
#include "config_store.h"

bool openaiTranscribe(const BillyConfig &cfg, const std::vector<uint8_t> &wav,
                      String &transcriptOut, String &errOut);

bool openaiChat(const BillyConfig &cfg, const String &userText, String &replyOut,
                String &errOut);

// Receives decoded PCM as it streams in. Return false to abort playback.
typedef bool (*PcmSink)(const int16_t *samples, size_t count);

bool openaiTts(const BillyConfig &cfg, const String &text, PcmSink sink, String &errOut);
