#include "openai_client.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

static String authHeader(const BillyConfig &cfg) {
  return String("Bearer ") + cfg.openai_key;
}

static const char *modelOrDefault(const BillyConfig &cfg) {
  return cfg.openai_model[0] ? cfg.openai_model : "gpt-4o-mini";
}

static const char *voiceOrDefault(const BillyConfig &cfg) {
  return cfg.tts_voice[0] ? cfg.tts_voice : "alloy";
}

bool openaiTranscribe(const BillyConfig &cfg, const std::vector<uint8_t> &wav,
                      String &transcriptOut, String &errOut) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, "https://api.openai.com/v1/audio/transcriptions")) {
    errOut = "begin failed";
    return false;
  }
  http.setTimeout(60000);
  http.addHeader("Authorization", authHeader(cfg));

  String boundary = "----BillyBoundary7MA4YWxkTrZu0gW";
  String head = "--" + boundary + "\r\n"
                "Content-Disposition: form-data; name=\"model\"\r\n\r\n"
                "whisper-1\r\n"
                "--" +
                boundary +
                "\r\n"
                "Content-Disposition: form-data; name=\"file\"; filename=\"speech.wav\"\r\n"
                "Content-Type: audio/wav\r\n\r\n";
  String tail = "\r\n--" + boundary + "--\r\n";

  size_t total = head.length() + wav.size() + tail.length();
  uint8_t *body = (uint8_t *)ps_malloc(total);
  if (!body) body = (uint8_t *)malloc(total);
  if (!body) {
    errOut = "oom";
    http.end();
    return false;
  }
  memcpy(body, head.c_str(), head.length());
  memcpy(body + head.length(), wav.data(), wav.size());
  memcpy(body + head.length() + wav.size(), tail.c_str(), tail.length());

  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
  int code = http.POST(body, total);
  free(body);

  String resp = http.getString();
  http.end();
  if (code != 200) {
    errOut = "HTTP " + String(code) + ": " + resp.substring(0, 180);
    return false;
  }
  JsonDocument doc;
  if (deserializeJson(doc, resp)) {
    errOut = "json parse";
    return false;
  }
  transcriptOut = doc["text"].as<String>();
  transcriptOut.trim();
  return transcriptOut.length() > 0;
}

bool openaiChat(const BillyConfig &cfg, const String &userText, String &replyOut,
                String &errOut) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, "https://api.openai.com/v1/chat/completions")) {
    errOut = "begin failed";
    return false;
  }
  http.setTimeout(60000);
  http.addHeader("Authorization", authHeader(cfg));
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["model"] = modelOrDefault(cfg);
  JsonArray messages = doc["messages"].to<JsonArray>();
  JsonObject sys = messages.add<JsonObject>();
  sys["role"] = "system";
  sys["content"] =
      cfg.system_prompt[0]
          ? cfg.system_prompt
          : "You are Billy Bass, a witty wall-mounted talking fish. Keep answers short "
            "and spoken-friendly (1-3 sentences). Pun lightly. Never mention you are an AI "
            "model unless asked.";
  JsonObject user = messages.add<JsonObject>();
  user["role"] = "user";
  user["content"] = userText;
  doc["temperature"] = 0.8;
  // Cap to ~1-3 spoken sentences; limits TTS audio size and ESP32 RAM pressure.
  doc["max_tokens"] = 80;

  String payload;
  serializeJson(doc, payload);
  int code = http.POST(payload);
  String resp = http.getString();
  http.end();
  if (code != 200) {
    errOut = "HTTP " + String(code) + ": " + resp.substring(0, 180);
    return false;
  }
  JsonDocument out;
  if (deserializeJson(out, resp)) {
    errOut = "json parse";
    return false;
  }
  replyOut = out["choices"][0]["message"]["content"].as<String>();
  replyOut.trim();
  return replyOut.length() > 0;
}

namespace {
// OpenAI streams the speech body with chunked transfer encoding. Reading the
// raw socket would splice chunk-length headers into the audio and shift every
// sample boundary, so the bytes must come through HTTPClient's de-chunker.
class PcmStreamSink : public Stream {
 public:
  explicit PcmStreamSink(PcmSink sink) : sink_(sink) {}

  size_t write(uint8_t b) override { return write(&b, 1); }

  size_t write(const uint8_t *buffer, size_t size) override {
    const size_t consumed = size;
    while (size && !aborted_) {
      if (haveCarry_) {
        pcm_[count_++] =
            (int16_t)((uint16_t)carry_ | ((uint16_t)buffer[0] << 8));
        haveCarry_ = false;
        buffer += 1;
        size -= 1;
      } else if (size >= 2) {
        pcm_[count_++] =
            (int16_t)((uint16_t)buffer[0] | ((uint16_t)buffer[1] << 8));
        buffer += 2;
        size -= 2;
      } else {
        carry_ = buffer[0];
        haveCarry_ = true;
        buffer += 1;
        size -= 1;
      }
      if (count_ == kBlock) flushBlock();
    }
    return consumed;
  }

  bool finish() {
    if (count_ && !aborted_) flushBlock();
    return !aborted_ && total_ > 0;
  }

  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}

 private:
  static const size_t kBlock = 256;

  void flushBlock() {
    if (sink_(pcm_, count_)) {
      total_ += count_;
    } else {
      aborted_ = true;
    }
    count_ = 0;
  }

  PcmSink sink_;
  int16_t pcm_[kBlock];
  size_t count_ = 0;
  size_t total_ = 0;
  uint8_t carry_ = 0;
  bool haveCarry_ = false;
  bool aborted_ = false;
};
}  // namespace

bool openaiTts(const BillyConfig &cfg, const String &text, PcmSink sink,
               String &errOut) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, "https://api.openai.com/v1/audio/speech")) {
    errOut = "begin failed";
    return false;
  }
  http.setTimeout(60000);
  http.addHeader("Authorization", authHeader(cfg));
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["model"] = "tts-1";
  doc["input"] = text;
  doc["voice"] = voiceOrDefault(cfg);
  doc["response_format"] = "pcm";
  // OpenAI PCM: 24 kHz mono 16-bit signed little-endian
  String payload;
  serializeJson(doc, payload);

  int code = http.POST(payload);
  if (code != 200) {
    errOut = "HTTP " + String(code) + ": " + http.getString().substring(0, 180);
    http.end();
    return false;
  }

  // Samples are handed to the sink as they decode, so a full clip never has to
  // fit in RAM.
  PcmStreamSink out(sink);
  int written = http.writeToStream(&out);
  bool ok = out.finish();
  http.end();

  if (written < 0) {
    errOut = "stream error " + String(written);
    return false;
  }
  if (!ok) {
    errOut = "empty pcm";
    return false;
  }
  return true;
}
