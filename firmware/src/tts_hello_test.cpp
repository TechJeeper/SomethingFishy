// Speaker TTS smoke test — config 1 (ONLY_LEFT, DOUT=11/WS=12/BCLK=13) confirmed.
// Speaks a buffered OpenAI TTS phrase; 25% keeps peaks under the amp's headroom.
#include <Arduino.h>
#include <WiFi.h>
#include <math.h>
#include <vector>

#include "pins.h"
#include "config_store.h"
#include "audio.h"
#include "openai_client.h"

static const char *kPhrase = "Hello, this is a test!";

static BillyConfig gCfg;
static bool gReady = false;
static std::vector<int16_t> gPcm;
static int gVolume = 70;

static bool ttsBufferSink(const int16_t *samples, size_t count) {
  gPcm.insert(gPcm.end(), samples, samples + count);
  return true;
}

static void playTone(int volumePercent, uint32_t ms) {
  if (!audioPlayBegin(TTS_SAMPLE_RATE)) {
    Serial.println("[tts-test] speaker init failed");
    return;
  }
  const float step = 2.0f * PI * 440.0f / TTS_SAMPLE_RATE;
  int16_t block[256];
  float phase = 0.0f;
  for (uint32_t done = 0; done < (TTS_SAMPLE_RATE * ms) / 1000; done += 256) {
    for (size_t i = 0; i < 256; ++i) {
      block[i] = static_cast<int16_t>(sinf(phase) * 32000.0f);
      phase += step;
      if (phase > 2.0f * PI) phase -= 2.0f * PI;
    }
    audioPlayWrite(block, 256, nullptr, volumePercent);
  }
  audioPlayEnd(nullptr);
}

static void playSine() {
  Serial.printf("[tts-test] sine 440 Hz at %d%%\n", gVolume);
  playTone(gVolume, 2000);
  Serial.println("[tts-test] sine done");
}

// Ascending levels: the first one that turns raspy marks where the amp or its
// 5 V rail runs out of headroom.
static void playLadder() {
  static const int kLevels[] = {10, 20, 30, 40, 60, 80};
  Serial.println("\n=== volume ladder: 6 tones, getting louder ===");
  for (size_t i = 0; i < sizeof(kLevels) / sizeof(kLevels[0]); ++i) {
    Serial.printf(">>> tone %u of 6 — %d%%\n", (unsigned)(i + 1), kLevels[i]);
    playTone(kLevels[i], 1200);
    delay(800);
  }
  Serial.println("Which tone number first sounded raspy/buzzy?\n");
}

static void playPhrase() {
  Serial.printf("[tts-test] downloading TTS for \"%s\"…\n", kPhrase);
  gPcm.clear();
  gPcm.reserve(TTS_SAMPLE_RATE * 4);

  if (!audioPlayBegin(TTS_SAMPLE_RATE)) {
    Serial.println("[tts-test] speaker init failed");
    return;
  }

  String err;
  uint32_t t0 = millis();
  bool ok = openaiTts(gCfg, kPhrase, ttsBufferSink, err);
  Serial.printf("[tts-test] got %u samples in %lu ms\n", (unsigned)gPcm.size(),
                (unsigned long)(millis() - t0));
  if (!ok) {
    audioPlayEnd(nullptr);
    Serial.printf("[tts-test] TTS failed: %s\n", err.c_str());
    gPcm.clear();
    return;
  }

  Serial.printf("[tts-test] speaking at %d%%: %s\n", gVolume, kPhrase);
  audioPlayWrite(gPcm.data(), gPcm.size(), nullptr, gVolume);
  audioPlayEnd(nullptr);
  gPcm.clear();
  gPcm.shrink_to_fit();
  Serial.println("[tts-test] done");
}

static bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(gCfg.wifi_ssid, gCfg.wifi_pass);
  Serial.printf("[wifi] connecting to %s", gCfg.wifi_ssid);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 25000) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[wifi] failed");
    return false;
  }
  Serial.printf("[wifi] ok ip=%s\n", WiFi.localIP().toString().c_str());
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println("=== SomethingFishy TTS test ===");
  Serial.printf("[tts-test] volume %d%%\n", gVolume);

  if (!audioBegin()) {
    Serial.println("[tts-test] audio init failed — check I2S wiring");
  }

  if (!configLoad(gCfg)) {
    Serial.println("[tts-test] no billycfg — flash config from flash.html first");
    return;
  }
  configPrintSummary(gCfg);
  if (!gCfg.openai_key[0] || !gCfg.wifi_ssid[0]) {
    Serial.println("[tts-test] incomplete config");
    return;
  }
  if (!connectWifi()) return;

  gReady = true;
  playPhrase();
  Serial.println("[tts-test] ready — l = ladder, s = sine, t = speak phrase, +/- = volume");
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'l' || c == 'L') {
      playLadder();
    } else if (c == 's' || c == 'S') {
      playSine();
    } else if (gReady && (c == 't' || c == 'T')) {
      playPhrase();
    } else if (c == '+' || c == '=') {
      gVolume = min(100, gVolume + 10);
      Serial.printf("[tts-test] volume %d%%\n", gVolume);
    } else if (c == '-' || c == '_') {
      gVolume = max(5, gVolume - 10);
      Serial.printf("[tts-test] volume %d%%\n", gVolume);
    }
  }
  delay(20);
}
