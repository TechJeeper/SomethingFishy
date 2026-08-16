#include <Arduino.h>
#include <WiFi.h>
#include <vector>
#include <cstring>

#include "pins.h"
#include "config_store.h"
#include "motors.h"
#include "audio.h"
#include "openai_client.h"

static BillyConfig gCfg;
static bool gReady = false;
static uint32_t gNextWakeSttMs = 0;

// Returns true if 'phrase' appears in 'text' (case-insensitive ASCII).
static bool containsWakePhrase(const String &text, const char *phrase) {
  if (!phrase || phrase[0] == '\0') return false;
  String lower = text;
  lower.toLowerCase();
  String lowerPhrase = String(phrase);
  lowerPhrase.toLowerCase();
  return lower.indexOf(lowerPhrase) >= 0;
}

// Record a short clip and return true if the wake phrase was heard.
static bool listenForWakePhrase() {
  // Avoid hammering Whisper on continuous TV/ambient audio.
  if (millis() < gNextWakeSttMs) {
    delay(20);
    return false;
  }

  std::vector<int16_t> pcm;
  // Short window: up to 2 s, stop after 600 ms of silence
  if (!audioRecord(pcm, 2000, 600)) {
    gNextWakeSttMs = millis() + 400;
    return false;
  }

  // Local energy gate: skip the API call if the recording is too quiet.
  // This avoids burning Whisper quota on silence/ambient noise.
  double energy = 0;
  for (int16_t s : pcm) energy += (double)s * (double)s;
  float rms = sqrtf((float)(energy / pcm.size())) / 32768.0f;
  if (rms < 0.035f) {
    gNextWakeSttMs = millis() + 500;
    return false;
  }

  std::vector<uint8_t> wav;
  if (!audioMakeWav(pcm, wav)) return false;

  gNextWakeSttMs = millis() + 1800;

  String transcript, err;
  if (!openaiTranscribe(gCfg, wav, transcript, err)) {
    Serial.printf("[billy] wake-listen STT: %s\n", err.c_str());
    return false;
  }
  if (transcript.length() == 0) return false;

  Serial.printf("[billy] wake-listen heard: %s\n", transcript.c_str());
  return containsWakePhrase(transcript, gCfg.wake_phrase);
}

static void onLipLevel(float level) { motorsLipSync(level); }

static bool ttsSink(const int16_t *samples, size_t count) {
  const int vol = gCfg.speaker_volume ? (int)gCfg.speaker_volume : 70;
  return audioPlayWrite(samples, count, onLipLevel, vol);
}

static void runConversationTurn() {
  Serial.println("[billy] listening…");
  mouthOpen();
  delay(60);
  mouthClose();

  std::vector<uint8_t> wav;
  {
    // Scoped so the raw PCM is released before the upload buffer is allocated.
    std::vector<int16_t> pcm;
    if (!audioRecord(pcm, 6000, 1400)) {
      Serial.println("[billy] no speech captured");
      return;
    }
    Serial.printf("[billy] captured %u samples\n", (unsigned)pcm.size());

    if (!audioMakeWav(pcm, wav)) {
      Serial.println("[billy] wav build failed");
      return;
    }
  }

  String transcript, err;
  if (!openaiTranscribe(gCfg, wav, transcript, err)) {
    Serial.printf("[billy] STT failed: %s\n", err.c_str());
    return;
  }
  Serial.printf("[billy] you: %s\n", transcript.c_str());

  // Give the TLS stack / heap a beat after the large Whisper upload.
  delay(250);
  yield();

  String reply;
  if (!openaiChat(gCfg, transcript, reply, err)) {
    Serial.printf("[billy] chat failed: %s\n", err.c_str());
    return;
  }
  Serial.printf("[billy] fish: %s\n", reply.c_str());

  if (!audioPlayBegin(TTS_SAMPLE_RATE)) {
    Serial.println("[billy] speaker init failed — check I2S amp wiring");
    return;
  }
  tailFlop();
  bool spoke = openaiTts(gCfg, reply, ttsSink, err);
  audioPlayEnd(onLipLevel);
  if (!spoke) {
    Serial.printf("[billy] TTS failed: %s\n", err.c_str());
    return;
  }
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
  Serial.printf("[mem] heap=%u psram=%u\n", (unsigned)ESP.getFreeHeap(),
                (unsigned)ESP.getPsramSize());

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
  if (gCfg.auto_listen && gCfg.wake_phrase[0]) {
    Serial.printf("[billy] ready — listening for wake phrase \"%s\"\n", gCfg.wake_phrase);
  } else {
    Serial.println("[billy] ready — hold talk button or send 't' over serial");
  }
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
      Serial.println("t=talk  m=mouth  M=motor self-test  x=stop");
    }
    if (c == 'm') {
      Serial.println("[motors] mouth pulse");
      mouthOpen();
      delay(300);
      mouthClose();
    }
    if (c == 'M') {
      motorsSelfTest();
    }
    if (c == 'x') motorsStop();
  }

  if (btn || serialTalk) {
    // debounce hold
    delay(40);
    if (digitalRead(PIN_TALK_BTN) == LOW || serialTalk) {
      Serial.printf("[billy] talk trigger (%s)\n", btn ? "button GPIO14" : "serial t");
      runConversationTurn();
    }
    // wait for release
    while (digitalRead(PIN_TALK_BTN) == LOW) delay(20);
  } else if (gCfg.auto_listen && gCfg.wake_phrase[0]) {
    // Wake-word mode: continuously listen for the configured phrase,
    // then hand off to a full conversation turn.
    if (listenForWakePhrase()) {
      Serial.println("[billy] wake phrase detected!");
      tailFlop();
      // Pause so the command recording isn't filled with the same ambient stream.
      Serial.println("[billy] say your request…");
      delay(700);
      runConversationTurn();
      gNextWakeSttMs = millis() + 2500;
    }
  } else {
    delay(10);
  }
}
