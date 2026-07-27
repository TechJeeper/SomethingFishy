#include <Arduino.h>
#include <WiFi.h>
#include <vector>

#include "pins.h"
#include "config_store.h"
#include "motors.h"
#include "audio.h"
#include "openai_client.h"

static BillyConfig gCfg;
static bool gReady = false;

static void onLipLevel(float level) { motorsLipSync(level); }

static void runConversationTurn() {
  Serial.println("[billy] listening…");
  mouthOpen();
  delay(60);
  mouthClose();

  std::vector<int16_t> pcm;
  if (!audioRecord(pcm, 8000, 1400)) {
    Serial.println("[billy] no speech captured");
    return;
  }
  Serial.printf("[billy] captured %u samples\n", (unsigned)pcm.size());

  std::vector<uint8_t> wav;
  if (!audioMakeWav(pcm, wav)) {
    Serial.println("[billy] wav build failed");
    return;
  }

  String transcript, err;
  if (!openaiTranscribe(gCfg, wav, transcript, err)) {
    Serial.printf("[billy] STT failed: %s\n", err.c_str());
    return;
  }
  Serial.printf("[billy] you: %s\n", transcript.c_str());

  String reply;
  if (!openaiChat(gCfg, transcript, reply, err)) {
    Serial.printf("[billy] chat failed: %s\n", err.c_str());
    return;
  }
  Serial.printf("[billy] fish: %s\n", reply.c_str());

  std::vector<int16_t> tts;
  if (!openaiTts(gCfg, reply, tts, err)) {
    Serial.printf("[billy] TTS failed: %s\n", err.c_str());
    return;
  }

  tailFlop();
  audioPlayPcm(tts.data(), tts.size(), TTS_SAMPLE_RATE, onLipLevel);
  mouthClose();
  motorsStop();
  Serial.println("[billy] turn done");
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
  Serial.println("=== SomethingFishy / Billy ESP32 ===");

  pinMode(PIN_TALK_BTN, INPUT_PULLUP);
  motorsBegin();

  if (!configLoad(gCfg)) {
    Serial.println("[billy] waiting for config flash from website…");
    // Wiggle tail so user knows firmware is alive without config
    for (int i = 0; i < 3; i++) {
      tailFlop();
      delay(400);
    }
    return;
  }
  configPrintSummary(gCfg);

  if (!gCfg.openai_key[0] || !gCfg.wifi_ssid[0]) {
    Serial.println("[billy] incomplete config");
    return;
  }

  if (!audioBegin()) {
    Serial.println("[billy] audio init failed — check I2S wiring");
  }

  if (!connectWifi()) {
    return;
  }

  gReady = true;
  Serial.println("[billy] ready — hold talk button or send 't' over serial");
  tailFlop();
}

void loop() {
  if (!gReady) {
    delay(200);
    // Still allow serial help
    if (Serial.available()) {
      char c = Serial.read();
      if (c == 'h') {
        Serial.println("No config. Open flash.html, fill Wi-Fi + OpenAI key, flash device.");
      }
    }
    return;
  }

  motorsTick();

  bool btn = digitalRead(PIN_TALK_BTN) == LOW;
  bool serialTalk = false;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 't' || c == 'T') serialTalk = true;
    if (c == 'h') {
      Serial.println("t = talk turn, m = mouth test, x = stop motors");
    }
    if (c == 'm') {
      mouthOpen();
      delay(300);
      mouthClose();
    }
    if (c == 'x') motorsStop();
  }

  if (btn || serialTalk) {
    // debounce hold
    delay(40);
    runConversationTurn();
    // wait for release
    while (digitalRead(PIN_TALK_BTN) == LOW) delay(20);
  }

  delay(10);
}
