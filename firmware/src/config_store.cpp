#include "config_store.h"
#include <Preferences.h>
#include <esp_partition.h>
#include <string.h>

static Preferences prefs;

static uint32_t crc32Update(uint32_t crc, const uint8_t *data, size_t len) {
  crc = ~crc;
  for (size_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (int k = 0; k < 8; k++) {
      crc = (crc >> 1) ^ (0xEDB88320u & (-(int)(crc & 1)));
    }
  }
  return ~crc;
}

uint32_t configCrc32(const BillyConfig &cfg) {
  BillyConfig tmp = cfg;
  tmp.crc32 = 0;
  return crc32Update(0, reinterpret_cast<const uint8_t *>(&tmp), sizeof(BillyConfig));
}

static bool readPartition(BillyConfig &out) {
  const esp_partition_t *part = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, (esp_partition_subtype_t)0x40, "billycfg");
  if (!part) {
    Serial.println("[cfg] billycfg partition not found");
    return false;
  }
  if (esp_partition_read(part, 0, &out, sizeof(out)) != ESP_OK) {
    Serial.println("[cfg] partition read failed");
    return false;
  }
  if (out.magic != BILLY_CFG_MAGIC || out.version != BILLY_CFG_VERSION) {
    Serial.printf("[cfg] bad magic/version: 0x%08lx / %u\n", (unsigned long)out.magic,
                  out.version);
    return false;
  }
  if (out.length != sizeof(BillyConfig)) {
    Serial.printf("[cfg] unexpected length %u\n", out.length);
    return false;
  }
  uint32_t expect = out.crc32;
  if (configCrc32(out) != expect) {
    Serial.println("[cfg] CRC mismatch");
    return false;
  }
  // Ensure C-strings are terminated
  out.wifi_ssid[sizeof(out.wifi_ssid) - 1] = 0;
  out.wifi_pass[sizeof(out.wifi_pass) - 1] = 0;
  out.openai_key[sizeof(out.openai_key) - 1] = 0;
  out.openai_model[sizeof(out.openai_model) - 1] = 0;
  out.tts_voice[sizeof(out.tts_voice) - 1] = 0;
  out.system_prompt[sizeof(out.system_prompt) - 1] = 0;
  out.wake_phrase[sizeof(out.wake_phrase) - 1] = 0;
  return true;
}

bool configSaveToNvs(const BillyConfig &cfg) {
  if (!prefs.begin("billy", false)) return false;
  prefs.putBytes("cfg", &cfg, sizeof(cfg));
  prefs.end();
  return true;
}

bool configLoadFromNvs(BillyConfig &out) {
  if (!prefs.begin("billy", true)) return false;
  size_t n = prefs.getBytesLength("cfg");
  if (n != sizeof(BillyConfig)) {
    prefs.end();
    return false;
  }
  prefs.getBytes("cfg", &out, sizeof(out));
  prefs.end();
  if (out.magic != BILLY_CFG_MAGIC) return false;
  return configCrc32(out) == out.crc32;
}

bool configLoad(BillyConfig &out) {
  memset(&out, 0, sizeof(out));
  if (readPartition(out)) {
    Serial.println("[cfg] loaded from billycfg partition");
    configSaveToNvs(out);
    return true;
  }
  if (configLoadFromNvs(out)) {
    Serial.println("[cfg] loaded from NVS");
    return true;
  }
  Serial.println("[cfg] no valid config — flash from the website");
  return false;
}

void configPrintSummary(const BillyConfig &cfg) {
  const unsigned vol = cfg.speaker_volume ? cfg.speaker_volume : 70;
  Serial.printf("[cfg] ssid=%s model=%s voice=%s auto=%u vol=%u%%\n", cfg.wifi_ssid,
                cfg.openai_model[0] ? cfg.openai_model : "(default)",
                cfg.tts_voice[0] ? cfg.tts_voice : "(default)", cfg.auto_listen, vol);
  Serial.printf("[cfg] key=%s…%s\n",
                cfg.openai_key[0] ? "***" : "(missing)",
                cfg.openai_key[0] ? "ok" : "");
}
