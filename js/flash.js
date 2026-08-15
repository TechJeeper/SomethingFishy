/**
 * SomethingFishy web flasher
 * - Packs BillyConfig matching firmware/include/config_store.h
 * - Flashes app (+ optional bootloader set) + config via esptool-js
 */

const BILLY_CFG_MAGIC = 0xf15c0001;
const BILLY_CFG_VERSION = 1;
const BILLY_CFG_SIZE = 976;
const BILLY_CFG_OFFSET = 0x300000;
const APP_OFFSET = 0x10000;

const logEl = document.getElementById("log");
const progressEl = document.getElementById("progress");
const statusPill = document.getElementById("status-pill");
const btnConnect = document.getElementById("btn-connect");
const btnFlash = document.getElementById("btn-flash");
const btnConfigOnly = document.getElementById("btn-config-only");
const fwSourceLabel = document.getElementById("fw-source-label");
const serialWarning = document.getElementById("serial-warning");
const openAiKeyEl = document.getElementById("openai_key");
const openAiModelEl = document.getElementById("openai_model");
const ttsVoiceEl = document.getElementById("tts_voice");
const btnValidateKey = document.getElementById("btn-validate-key");
const apiKeyStatusEl = document.getElementById("api-key-status");
const btnPreviewVoice = document.getElementById("btn-preview-voice");
const voiceStatusEl = document.getElementById("voice-status");
const voicePreviewEl = document.getElementById("voice-preview");

const DEFAULT_CHAT_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"];
const DEFAULT_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const OPENAI_VOICE_ENDPOINTS = ["https://api.openai.com/v1/audio/voices", "https://api.openai.com/v1/voices"];
const VOICE_PREVIEW_MODEL = "tts-1";
const VOICE_PREVIEW_TEXT = "Hey there — I am Billy Bass, and this is my voice preview.";
const NETWORK_ERROR_MESSAGE =
  "Network request to api.openai.com failed — check your internet connection" +
  (typeof location === "undefined" || location.protocol === "https:" || location.hostname === "localhost"
    ? "."
    : " and that the page is served over HTTPS or localhost.");

let validatedApiKey = "";
let apiKeyValidationState = "idle";
let currentVoicePreviewUrl = null;

let port = null;
let transport = null;
let esploader = null;

function log(msg, cls) {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = msg;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setProgress(pct) {
  progressEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function setStatus(text, state) {
  statusPill.textContent = text;
  statusPill.classList.remove("connected", "error");
  if (state) statusPill.classList.add(state);
}

function setInlineStatus(el, text, state) {
  el.textContent = text;
  el.classList.remove("pending", "ok", "err");
  if (state) el.classList.add(state);
}

function setApiKeyValidationState(state, text) {
  apiKeyValidationState = state;
  setInlineStatus(apiKeyStatusEl, text, state === "valid" ? "ok" : state === "invalid" ? "err" : state);
}

function setVoiceStatus(text, state) {
  setInlineStatus(voiceStatusEl, text, state);
}

function resetVoicePreview() {
  voicePreviewEl.pause();
  voicePreviewEl.hidden = true;
  voicePreviewEl.onended = null;
  voicePreviewEl.onerror = null;
  voicePreviewEl.removeAttribute("src");
  voicePreviewEl.load();
  if (currentVoicePreviewUrl) {
    URL.revokeObjectURL(currentVoicePreviewUrl);
    currentVoicePreviewUrl = null;
  }
}

function markApiKeyDirty() {
  validatedApiKey = "";
  setApiKeyValidationState("idle", "Validate the key to refresh models and voices.");
  setVoiceStatus("Preview uses your API key and plays in-browser.", null);
  resetVoicePreview();
}

function writeCString(view, offset, str, maxLen) {
  const enc = new TextEncoder();
  const bytes = enc.encode(str || "");
  const n = Math.min(bytes.length, maxLen - 1);
  for (let i = 0; i < maxLen; i++) view.setUint8(offset + i, 0);
  for (let i = 0; i < n; i++) view.setUint8(offset + i, bytes[i]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Build packed BillyConfig binary (little-endian). */
export function buildConfigBinary(fields) {
  const buf = new ArrayBuffer(BILLY_CFG_SIZE);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  view.setUint32(0, BILLY_CFG_MAGIC, true);
  view.setUint16(4, BILLY_CFG_VERSION, true);
  view.setUint16(6, BILLY_CFG_SIZE, true);

  let o = 8;
  writeCString(view, o, fields.wifi_ssid, 64);
  o += 64;
  writeCString(view, o, fields.wifi_pass, 64);
  o += 64;
  writeCString(view, o, fields.openai_key, 192);
  o += 192;
  writeCString(view, o, fields.openai_model, 48);
  o += 48;
  writeCString(view, o, fields.tts_voice, 32);
  o += 32;
  writeCString(view, o, fields.system_prompt, 512);
  o += 512;
  writeCString(view, o, fields.wake_phrase, 48);
  o += 48;
  view.setUint8(o, fields.auto_listen ? 1 : 0);
  o += 1;
  view.setUint8(o++, 0);
  view.setUint8(o++, 0);
  view.setUint8(o++, 0);

  view.setUint32(o, 0, true);
  const sum = crc32(u8);
  view.setUint32(o, sum, true);
  return u8;
}

function readForm() {
  return {
    wifi_ssid: document.getElementById("wifi_ssid").value.trim(),
    wifi_pass: document.getElementById("wifi_pass").value,
    openai_key: document.getElementById("openai_key").value.trim(),
    openai_model: document.getElementById("openai_model").value,
    tts_voice: document.getElementById("tts_voice").value,
    system_prompt: document.getElementById("system_prompt").value,
    wake_phrase: document.getElementById("wake_phrase").value.trim(),
    auto_listen: document.getElementById("auto_listen").value === "1",
  };
}

function validate(fields) {
  if (!fields.wifi_ssid) return "Wi‑Fi SSID is required.";
  if (!fields.openai_key.startsWith("sk-")) {
    return "OpenAI API key should start with sk-.";
  }
  return null;
}

function replaceSelectOptions(selectEl, values, preferredValue) {
  const currentValue = preferredValue || selectEl.value;
  const seen = new Set();
  const nextValues = values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
  selectEl.innerHTML = "";
  for (const value of nextValues) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === currentValue) option.selected = true;
    selectEl.appendChild(option);
  }
  if (!selectEl.value && nextValues[0]) {
    selectEl.value = nextValues[0];
  }
}

async function parseOpenAiError(res) {
  const text = await res.text();
  if (!text) return res.statusText;
  try {
    const body = JSON.parse(text);
    return body?.error?.message || text;
  } catch (_) {
    return text;
  }
}

async function openAiFetchJson(url, apiKey, init = {}) {
  const headers = {
    Authorization: "Bearer " + apiKey,
    ...(init.headers || {}),
  };
  let res;
  try {
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (networkErr) {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) {
    const detail = await parseOpenAiError(res);
    const err = new Error(detail || `${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

function isLikelyChatModel(id) {
  if (!id) return false;
  const lower = id.toLowerCase();
  if (/audio|image|embedding|moderation|transcribe|whisper|tts|realtime|search|computer-use|davinci|babbage|curie/.test(lower)) return false;
  return /^(gpt-|chatgpt-|o\d+)/.test(lower);
}

function sortModels(models) {
  const defaults = new Map(DEFAULT_CHAT_MODELS.map((value, index) => [value, index]));
  return [...models].sort((a, b) => {
    const ai = defaults.has(a) ? defaults.get(a) : Number.MAX_SAFE_INTEGER;
    const bi = defaults.has(b) ? defaults.get(b) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

async function fetchAvailableModels(apiKey) {
  const payload = await openAiFetchJson("https://api.openai.com/v1/models", apiKey);
  const models = sortModels(
    (payload?.data || [])
      .map((entry) => entry?.id)
      .filter(isLikelyChatModel)
  );
  return models.length ? models : DEFAULT_CHAT_MODELS;
}

function extractVoiceIds(payload) {
  const rawVoices = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.voices)
        ? payload.voices
        : [];
  return rawVoices
    .map((voice) => (typeof voice === "string" ? voice : voice?.id || voice?.name || voice?.value))
    .filter(Boolean);
}

async function fetchAvailableVoices(apiKey) {
  for (const url of OPENAI_VOICE_ENDPOINTS) {
    try {
      const payload = await openAiFetchJson(url, apiKey);
      const voices = extractVoiceIds(payload);
      if (voices.length) return { voices, source: "api" };
    } catch (err) {
      if (err?.status === 401 || err?.status === 429) throw err;
      if (!err?.status || err?.status === 404 || err?.status === 405) continue;
      throw err;
    }
  }
  return { voices: DEFAULT_VOICES, source: "fallback" };
}

async function refreshOpenAiOptions() {
  const apiKey = openAiKeyEl.value.trim();
  if (!apiKey) {
    setApiKeyValidationState("invalid", "OpenAI API key is required.");
    throw new Error("OpenAI API key is required.");
  }
  if (!apiKey.startsWith("sk-")) {
    setApiKeyValidationState("invalid", "OpenAI API key should start with sk-.");
    throw new Error("OpenAI API key should start with sk-.");
  }

  btnValidateKey.disabled = true;
  btnPreviewVoice.disabled = true;
  setApiKeyValidationState("pending", "Validating API key and refreshing options…");

  try {
    const [models, voiceResult] = await Promise.all([fetchAvailableModels(apiKey), fetchAvailableVoices(apiKey)]);
    replaceSelectOptions(openAiModelEl, models, openAiModelEl.value || DEFAULT_CHAT_MODELS[0]);
    replaceSelectOptions(ttsVoiceEl, voiceResult.voices, ttsVoiceEl.value || DEFAULT_VOICES[0]);
    validatedApiKey = apiKey;
    setApiKeyValidationState(
      "valid",
      `Validated. Loaded ${models.length} models and ${voiceResult.voices.length} voices${voiceResult.source === "api" ? "." : " (using built-in voice list)."}` 
    );
    setVoiceStatus("Voice preview is ready.", "ok");
    return { models, voices: voiceResult.voices };
  } catch (err) {
    validatedApiKey = "";
    setApiKeyValidationState("invalid", `Validation failed: ${err.message || err}`);
    setVoiceStatus("Preview unavailable until the API key validates.", "err");
    throw err;
  } finally {
    btnValidateKey.disabled = false;
    btnPreviewVoice.disabled = false;
  }
}

async function ensureValidatedApiKey() {
  const apiKey = openAiKeyEl.value.trim();
  if (validatedApiKey === apiKey && apiKeyValidationState === "valid") return true;
  await refreshOpenAiOptions();
  return true;
}

async function previewSelectedVoice() {
  btnPreviewVoice.disabled = true;
  setVoiceStatus("Generating voice preview…", "pending");
  try {
    await ensureValidatedApiKey();
    resetVoicePreview();
    const headers = {
      Authorization: "Bearer " + validatedApiKey,
      "Content-Type": "application/json",
    };
    let res;
    try {
      res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: VOICE_PREVIEW_MODEL,
          voice: ttsVoiceEl.value,
          input: VOICE_PREVIEW_TEXT,
          response_format: "mp3",
        }),
      });
    } catch (networkErr) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    if (!res.ok) {
      throw new Error(await parseOpenAiError(res));
    }
    const audioBlob = await res.blob();
    currentVoicePreviewUrl = URL.createObjectURL(audioBlob);
    voicePreviewEl.src = currentVoicePreviewUrl;
    voicePreviewEl.hidden = false;
    voicePreviewEl.onended = () => setVoiceStatus(`Finished previewing ${ttsVoiceEl.value}.`, "ok");
    voicePreviewEl.onerror = () => setVoiceStatus(`Preview playback failed for ${ttsVoiceEl.value}.`, "err");
    await voicePreviewEl.play();
    setVoiceStatus(`Playing ${ttsVoiceEl.value}.`, "ok");
  } catch (err) {
    resetVoicePreview();
    setVoiceStatus(`Preview failed: ${err.message || err}`, "err");
    log(`Voice preview failed: ${err.message || err}`, "err");
  } finally {
    btnPreviewVoice.disabled = false;
  }
}

async function arrayBufferToBinaryString(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const chunk = 0x8000;
  let result = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    result += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return result;
}

async function fetchBin(name) {
  const url = new URL(`firmware-bin/${name}`, window.location.href).href;
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

async function loadFlashPlan() {
  const fileInput = document.getElementById("fw_file");
  const parts = [];

  if (fileInput.files && fileInput.files[0]) {
    const ab = await fileInput.files[0].arrayBuffer();
    parts.push({ name: fileInput.files[0].name, data: new Uint8Array(ab), address: APP_OFFSET });
    fwSourceLabel.textContent = `Using uploaded file (${fileInput.files[0].name}, ${ab.byteLength} bytes).`;
    return parts;
  }

  const bootloader = await fetchBin("bootloader.bin");
  const partitions = await fetchBin("partitions.bin");
  const bootApp0 = await fetchBin("boot_app0.bin");
  const firmware = await fetchBin("firmware.bin");

  if (!firmware) {
    throw new Error(
      "No bundled firmware.bin found. Build with PlatformIO (firmware/) or upload firmware.bin above."
    );
  }

  if (bootloader) parts.push({ name: "bootloader.bin", data: bootloader, address: 0x0 });
  if (partitions) parts.push({ name: "partitions.bin", data: partitions, address: 0x8000 });
  if (bootApp0) parts.push({ name: "boot_app0.bin", data: bootApp0, address: 0xe000 });
  parts.push({ name: "firmware.bin", data: firmware, address: APP_OFFSET });

  fwSourceLabel.textContent = `Using bundled images: ${parts.map((p) => p.name).join(", ")}.`;
  return parts;
}

async function getEspTool() {
  try {
    return await import("https://esm.sh/esptool-js@0.5.5");
  } catch (e) {
    log("esm.sh import failed, trying unpkg…", "err");
    return await import("https://unpkg.com/esptool-js@0.5.5/lib/index.js");
  }
}

async function connect() {
  if (!("serial" in navigator)) {
    serialWarning.hidden = false;
    throw new Error("Web Serial API not available in this browser.");
  }
  const { Transport, ESPLoader } = await getEspTool();
  port = await navigator.serial.requestPort();
  const baud = Number(document.getElementById("baud").value) || 921600;
  transport = new Transport(port, true);
  esploader = new ESPLoader({
    transport,
    baudrate: baud,
    romBaudrate: 115200,
    terminal: {
      clean() {},
      writeLine(data) {
        log(data);
      },
      write(data) {
        if (data?.trim()) log(data);
      },
    },
  });
  const chip = await esploader.main();
  log(`Connected: ${chip || esploader.chip?.CHIP_NAME || "ESP"}`, "ok");
  setStatus("Connected", "connected");
  btnFlash.disabled = false;
  btnConfigOnly.disabled = false;
}

async function disconnectQuiet() {
  try {
    if (transport) await transport.disconnect();
  } catch (_) {
    /* ignore */
  }
  transport = null;
  esploader = null;
  port = null;
  setStatus("Not connected");
  btnFlash.disabled = true;
  btnConfigOnly.disabled = true;
  btnConnect.textContent = "Connect USB";
}

async function flashFiles(fileArray) {
  if (!esploader) throw new Error("Not connected");
  setProgress(0);
  await esploader.writeFlash({
    fileArray,
    flashSize: "keep",
    flashMode: "keep",
    flashFreq: "keep",
    eraseAll: false,
    compress: true,
    reportProgress: (fileIndex, written, total) => {
      const pct = total ? (written / total) * 100 : 0;
      setProgress(pct);
      if (written === total) log(`Part ${fileIndex + 1}/${fileArray.length} done`, "ok");
    },
  });
  try {
    await esploader.after("hard_reset");
  } catch (_) {
    log("Hard reset not confirmed — press RESET on the board.");
  }
  setProgress(100);
}

async function flashAll() {
  const fields = readForm();
  const err = validate(fields);
  if (err) {
    log(err, "err");
    return;
  }
  btnFlash.disabled = true;
  btnConfigOnly.disabled = true;
  try {
    await ensureValidatedApiKey();
    log("Loading firmware images…");
    const plan = await loadFlashPlan();
    const cfg = buildConfigBinary(fields);
    log(`Config blob ${cfg.byteLength} bytes @ 0x${BILLY_CFG_OFFSET.toString(16)}`);

    const fileArray = [];
    for (const part of plan) {
      fileArray.push({
        data: await arrayBufferToBinaryString(part.data),
        address: part.address,
      });
      log(`  + ${part.name} @ 0x${part.address.toString(16)} (${part.data.byteLength} bytes)`);
    }
    fileArray.push({
      data: await arrayBufferToBinaryString(cfg),
      address: BILLY_CFG_OFFSET,
    });

    log("Writing flash…");
    await flashFiles(fileArray);
    log("Flash complete. Watch serial for [billy] ready.", "ok");
    setStatus("Flashed", "connected");
  } catch (e) {
    console.error(e);
    log(String(e.message || e), "err");
    setStatus("Error", "error");
  } finally {
    btnFlash.disabled = !esploader;
    btnConfigOnly.disabled = !esploader;
  }
}

async function flashConfigOnly() {
  const fields = readForm();
  const err = validate(fields);
  if (err) {
    log(err, "err");
    return;
  }
  btnFlash.disabled = true;
  btnConfigOnly.disabled = true;
  try {
    await ensureValidatedApiKey();
    const cfg = buildConfigBinary(fields);
    const cfgStr = await arrayBufferToBinaryString(cfg);
    log("Writing config partition only…");
    await flashFiles([{ data: cfgStr, address: BILLY_CFG_OFFSET }]);
    log("Config written. Reset the board.", "ok");
  } catch (e) {
    log(String(e.message || e), "err");
    setStatus("Error", "error");
  } finally {
    btnFlash.disabled = !esploader;
    btnConfigOnly.disabled = !esploader;
  }
}

btnConnect.addEventListener("click", async () => {
  try {
    if (esploader) {
      await disconnectQuiet();
      log("Disconnected.");
      return;
    }
    log("Requesting serial port…");
    await connect();
    btnConnect.textContent = "Disconnect";
  } catch (e) {
    log(String(e.message || e), "err");
    setStatus("Error", "error");
  }
});

btnFlash.addEventListener("click", () => flashAll());
btnConfigOnly.addEventListener("click", () => flashConfigOnly());
btnValidateKey.addEventListener("click", async () => {
  try {
    await refreshOpenAiOptions();
    log("OpenAI API key validated and options refreshed.", "ok");
  } catch (e) {
    log(String(e.message || e), "err");
  }
});
btnPreviewVoice.addEventListener("click", () => previewSelectedVoice());
openAiKeyEl.addEventListener("input", () => {
  const currentKey = openAiKeyEl.value.trim();
  if (currentKey === validatedApiKey && apiKeyValidationState === "valid") return;
  if (apiKeyValidationState !== "idle") {
    markApiKeyDirty();
  }
});

if (!("serial" in navigator)) {
  serialWarning.hidden = false;
  btnConnect.disabled = true;
  log("Web Serial unavailable — use Chrome/Edge over HTTPS.", "err");
} else {
  log("Chrome/Edge detected. Fill the form, connect USB, then flash.");
}
markApiKeyDirty();
