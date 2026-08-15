// I2S wiring/format sweep. Plays a 440 Hz tone under each plausible pin
// mapping and channel format so a clean-sounding combination can be picked by
// ear. Self-contained: it drives I2S_SPK_PORT directly and never touches the
// mic, so nothing here depends on audio.cpp.
#include <Arduino.h>
#include <driver/i2s.h>
#include <math.h>

#include "pins.h"

struct SpeakerConfig {
  const char *label;
  int dout;
  int ws;
  int bclk;
  i2s_channel_fmt_t fmt;
};

// Index 0 is what the guide's wiring and firmware currently assume.
static const SpeakerConfig kConfigs[] = {
    {"1: DOUT=11 WS=12 BCLK=13, ONLY_LEFT  (what the firmware uses now)",
     PIN_I2S_SPK_DOUT, PIN_I2S_SPK_WS, PIN_I2S_SPK_BCLK,
     I2S_CHANNEL_FMT_ONLY_LEFT},
    {"2: DOUT=11 WS=12 BCLK=13, ONLY_RIGHT", PIN_I2S_SPK_DOUT, PIN_I2S_SPK_WS,
     PIN_I2S_SPK_BCLK, I2S_CHANNEL_FMT_ONLY_RIGHT},
    {"3: DOUT=11 WS=12 BCLK=13, stereo (sample duplicated L+R)",
     PIN_I2S_SPK_DOUT, PIN_I2S_SPK_WS, PIN_I2S_SPK_BCLK,
     I2S_CHANNEL_FMT_RIGHT_LEFT},
    {"4: DOUT=11 WS=13 BCLK=12, stereo (WS/BCLK swapped)", PIN_I2S_SPK_DOUT,
     PIN_I2S_SPK_BCLK, PIN_I2S_SPK_WS, I2S_CHANNEL_FMT_RIGHT_LEFT},
    {"5: DOUT=13 WS=12 BCLK=11, stereo (DOUT/BCLK swapped)", PIN_I2S_SPK_BCLK,
     PIN_I2S_SPK_WS, PIN_I2S_SPK_DOUT, I2S_CHANNEL_FMT_RIGHT_LEFT},
    {"6: DOUT=12 WS=11 BCLK=13, stereo (DOUT/WS swapped)", PIN_I2S_SPK_WS,
     PIN_I2S_SPK_DOUT, PIN_I2S_SPK_BCLK, I2S_CHANNEL_FMT_RIGHT_LEFT},
};
static constexpr size_t kConfigCount = sizeof(kConfigs) / sizeof(kConfigs[0]);

static constexpr uint32_t kToneRate = 24000;
static constexpr float kToneHz = 440.0f;
static constexpr int16_t kPeak = 8000;  // ~25% of full scale
static bool gInstalled = false;

static bool installSpeaker(const SpeakerConfig &sc) {
  if (gInstalled) {
    i2s_driver_uninstall(I2S_SPK_PORT);
    gInstalled = false;
  }
  i2s_config_t cfg = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = kToneRate,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = sc.fmt,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 8,
      .dma_buf_len = 256,
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0};
  i2s_pin_config_t pins = {.bck_io_num = sc.bclk,
                           .ws_io_num = sc.ws,
                           .data_out_num = sc.dout,
                           .data_in_num = I2S_PIN_NO_CHANGE};
  if (i2s_driver_install(I2S_SPK_PORT, &cfg, 0, nullptr) != ESP_OK) return false;
  if (i2s_set_pin(I2S_SPK_PORT, &pins) != ESP_OK) return false;
  gInstalled = true;
  return true;
}

static void playTone(const SpeakerConfig &sc, uint32_t ms) {
  const bool stereo = sc.fmt == I2S_CHANNEL_FMT_RIGHT_LEFT;
  const float step = 2.0f * PI * kToneHz / kToneRate;
  const size_t frames = 256;
  int16_t block[frames * 2];
  float phase = 0.0f;

  for (uint32_t done = 0; done < (kToneRate * ms) / 1000; done += frames) {
    for (size_t i = 0; i < frames; ++i) {
      int16_t s = (int16_t)(sinf(phase) * kPeak);
      phase += step;
      if (phase > 2.0f * PI) phase -= 2.0f * PI;
      if (stereo) {
        block[i * 2] = s;
        block[i * 2 + 1] = s;
      } else {
        block[i] = s;
      }
    }
    size_t bytes = frames * sizeof(int16_t) * (stereo ? 2 : 1);
    size_t written = 0;
    i2s_write(I2S_SPK_PORT, block, bytes, &written, portMAX_DELAY);
  }

  int16_t silence[128] = {0};
  size_t written = 0;
  i2s_write(I2S_SPK_PORT, silence, sizeof(silence), &written, portMAX_DELAY);
}

static void runConfig(size_t index) {
  const SpeakerConfig &sc = kConfigs[index];
  Serial.printf("\n>>> %s\n", sc.label);
  if (!installSpeaker(sc)) {
    Serial.println("    driver install failed");
    return;
  }
  playTone(sc, 2000);
  Serial.println("    tone finished");
}

static void runSweep() {
  Serial.println("\n=== sweeping all configs (2 s tone, 1.5 s gap) ===");
  for (size_t i = 0; i < kConfigCount; ++i) {
    runConfig(i);
    delay(1500);
  }
  Serial.println("\nWhich number sounded like a clean steady tone?");
  Serial.println("Press 1-6 to replay one, or 'a' to sweep again.");
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println();
  Serial.println("=== SomethingFishy I2S speaker sweep ===");
  Serial.println("A clean config = smooth steady 440 Hz tone, no buzz/rasp.");
  runSweep();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c >= '1' && c <= '0' + (char)kConfigCount) {
      runConfig((size_t)(c - '1'));
    } else if (c == 'a' || c == 'A') {
      runSweep();
    }
  }
  delay(20);
}
