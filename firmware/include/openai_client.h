#pragma once
#include <Arduino.h>
#include <vector>
#include "config_store.h"

bool openaiTranscribe(const BillyConfig &cfg, const std::vector<uint8_t> &wav,
                      String &transcriptOut, String &errOut);

bool openaiChat(const BillyConfig &cfg, const String &userText, String &replyOut,
                String &errOut);

bool openaiTts(const BillyConfig &cfg, const String &text,
               std::vector<int16_t> &pcmOut, String &errOut);
