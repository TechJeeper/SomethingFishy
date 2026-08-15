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

  // Stream straight through to the sink: a full clip would not fit in RAM.
  WiFiClient *stream = http.getStreamPtr();
  const size_t bufSize = 1024;
  uint8_t buf[bufSize];
  int16_t pcm[bufSize / 2];
  size_t pcmCount = 0;
  uint8_t carry = 0;
  bool haveCarry = false;
  size_t totalSamples = 0;
  bool aborted = false;
  uint32_t lastData = millis();

  while (!aborted && (http.connected() || stream->available())) {
    size_t avail = stream->available();
    if (!avail) {
      if (millis() - lastData > 15000) break;
      delay(1);
      continue;
    }
    size_t n = stream->readBytes(buf, min(avail, bufSize));
    if (!n) continue;
    lastData = millis();

    size_t i = 0;
    if (haveCarry) {
      pcm[pcmCount++] = (int16_t)((uint16_t)carry | ((uint16_t)buf[0] << 8));
      haveCarry = false;
      i = 1;
    }
    if ((n - i) & 1) {
      carry = buf[n - 1];
      haveCarry = true;
      n -= 1;
    }
    for (; i + 1 < n; i += 2) {
      pcm[pcmCount++] = (int16_t)((uint16_t)buf[i] | ((uint16_t)buf[i + 1] << 8));
      if (pcmCount == sizeof(pcm) / sizeof(pcm[0])) {
        if (!sink(pcm, pcmCount)) {
          aborted = true;
          break;
        }
        totalSamples += pcmCount;
        pcmCount = 0;
      }
    }
  }
  if (!aborted && pcmCount) {
    sink(pcm, pcmCount);
    totalSamples += pcmCount;
  }
  http.end();
  if (!totalSamples) {
    errOut = "empty pcm";
    return false;
  }
  return true;
}
