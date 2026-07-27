#include "audio.h"
#include "pins.h"
#include <driver/i2s.h>
#include <math.h>
#include <string.h>

static bool micReady = false;
static bool spkReady = false;

static bool installMic() {
  i2s_config_t cfg = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
      .sample_rate = SAMPLE_RATE_HZ,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
      .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 8,
      .dma_buf_len = 256,
      .use_apll = false,
      .tx_desc_auto_clear = false,
      .fixed_mclk = 0};
  i2s_pin_config_t pins = {
      .bck_io_num = PIN_I2S_MIC_SCK,
      .ws_io_num = PIN_I2S_MIC_WS,
      .data_out_num = I2S_PIN_NO_CHANGE,
      .data_in_num = PIN_I2S_MIC_SD};
  if (i2s_driver_install(I2S_MIC_PORT, &cfg, 0, nullptr) != ESP_OK) return false;
  if (i2s_set_pin(I2S_MIC_PORT, &pins) != ESP_OK) return false;
  i2s_zero_dma_buffer(I2S_MIC_PORT);
  micReady = true;
  return true;
}

static bool installSpk(uint32_t rate) {
  if (spkReady) {
    i2s_driver_uninstall(I2S_SPK_PORT);
    spkReady = false;
  }
  i2s_config_t cfg = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = (int)rate,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 8,
      .dma_buf_len = 256,
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0};
  i2s_pin_config_t pins = {
      .bck_io_num = PIN_I2S_SPK_BCLK,
      .ws_io_num = PIN_I2S_SPK_WS,
      .data_out_num = PIN_I2S_SPK_DOUT,
      .data_in_num = I2S_PIN_NO_CHANGE};
  if (i2s_driver_install(I2S_SPK_PORT, &cfg, 0, nullptr) != ESP_OK) return false;
  if (i2s_set_pin(I2S_SPK_PORT, &pins) != ESP_OK) return false;
  spkReady = true;
  return true;
}

bool audioBegin() {
  bool ok = installMic();
  ok = installSpk(TTS_SAMPLE_RATE) && ok;
  return ok;
}

void audioEnd() {
  if (micReady) {
    i2s_driver_uninstall(I2S_MIC_PORT);
    micReady = false;
  }
  if (spkReady) {
    i2s_driver_uninstall(I2S_SPK_PORT);
    spkReady = false;
  }
}

bool audioRecord(std::vector<int16_t> &out, uint32_t maxMs, uint32_t silenceTimeoutMs) {
  if (!micReady) return false;
  out.clear();
  const size_t maxSamples = (SAMPLE_RATE_HZ * maxMs) / 1000;
  out.reserve(maxSamples);

  int32_t raw[256];
  size_t bytesRead = 0;
  uint32_t start = millis();
  uint32_t lastVoice = millis();
  bool heard = false;

  while (out.size() < maxSamples) {
    if (i2s_read(I2S_MIC_PORT, raw, sizeof(raw), &bytesRead, portMAX_DELAY) != ESP_OK) {
      break;
    }
    size_t n = bytesRead / sizeof(int32_t);
    double energy = 0;
    for (size_t i = 0; i < n; i++) {
      // INMP441 often left-aligned 24-bit in 32-bit word
      int16_t s = (int16_t)(raw[i] >> 14);
      out.push_back(s);
      energy += (double)s * (double)s;
    }
    if (n) {
      float rms = sqrtf((float)(energy / n)) / 32768.0f;
      if (rms > 0.02f) {
        heard = true;
        lastVoice = millis();
      }
    }
    if (heard && (millis() - lastVoice > silenceTimeoutMs)) break;
    if (!heard && (millis() - start > maxMs)) break;
    if (millis() - start > maxMs) break;
  }
  return out.size() > SAMPLE_RATE_HZ / 5; // at least ~200ms
}

bool audioPlayPcm(const int16_t *data, size_t samples, uint32_t sampleRateHz,
                  void (*onLevel)(float)) {
  if (!installSpk(sampleRateHz)) return false;
  const size_t chunk = 256;
  size_t written = 0;
  for (size_t i = 0; i < samples; i += chunk) {
    size_t n = min(chunk, samples - i);
    if (onLevel) {
      double e = 0;
      for (size_t j = 0; j < n; j++) {
        float v = data[i + j] / 32768.0f;
        e += v * v;
      }
      onLevel(sqrtf((float)(e / n)));
    }
    size_t bw = 0;
    i2s_write(I2S_SPK_PORT, data + i, n * sizeof(int16_t), &bw, portMAX_DELAY);
    written += bw;
  }
  // brief silence to flush
  int16_t z[128] = {0};
  size_t bw = 0;
  i2s_write(I2S_SPK_PORT, z, sizeof(z), &bw, portMAX_DELAY);
  if (onLevel) onLevel(0);
  return written > 0;
}

bool audioMakeWav(const std::vector<int16_t> &pcm, std::vector<uint8_t> &wavOut) {
  const uint32_t dataBytes = pcm.size() * sizeof(int16_t);
  const uint32_t sampleRate = SAMPLE_RATE_HZ;
  const uint16_t channels = 1;
  const uint16_t bits = 16;
  const uint32_t byteRate = sampleRate * channels * bits / 8;
  const uint16_t blockAlign = channels * bits / 8;

  wavOut.resize(44 + dataBytes);
  uint8_t *h = wavOut.data();
  memcpy(h + 0, "RIFF", 4);
  uint32_t chunkSize = 36 + dataBytes;
  memcpy(h + 4, &chunkSize, 4);
  memcpy(h + 8, "WAVE", 4);
  memcpy(h + 12, "fmt ", 4);
  uint32_t sub1 = 16;
  memcpy(h + 16, &sub1, 4);
  uint16_t audioFormat = 1;
  memcpy(h + 20, &audioFormat, 2);
  memcpy(h + 22, &channels, 2);
  memcpy(h + 24, &sampleRate, 4);
  memcpy(h + 28, &byteRate, 4);
  memcpy(h + 32, &blockAlign, 2);
  memcpy(h + 34, &bits, 2);
  memcpy(h + 36, "data", 4);
  memcpy(h + 40, &dataBytes, 4);
  memcpy(h + 44, pcm.data(), dataBytes);
  return true;
}
