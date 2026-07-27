#pragma once
#include <Arduino.h>
#include <stdint.h>

// Written by the SomethingFishy web flasher into the billycfg partition.
// Keep layout stable — JS encoder must match exactly.

#define BILLY_CFG_MAGIC   0xF15C0001u
#define BILLY_CFG_VERSION 1u

struct __attribute__((packed)) BillyConfig {
  uint32_t magic;
  uint16_t version;
  uint16_t length;
  char wifi_ssid[64];
  char wifi_pass[64];
  char openai_key[192];
  char openai_model[48];
  char tts_voice[32];
  char system_prompt[512];
  char wake_phrase[48];
  uint8_t auto_listen;
  uint8_t reserved[3];
  uint32_t crc32;
};

bool configLoad(BillyConfig &out);
bool configSaveToNvs(const BillyConfig &cfg);
bool configLoadFromNvs(BillyConfig &out);
uint32_t configCrc32(const BillyConfig &cfg);
void configPrintSummary(const BillyConfig &cfg);
