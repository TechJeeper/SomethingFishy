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

if (!("serial" in navigator)) {
  serialWarning.hidden = false;
  btnConnect.disabled = true;
  log("Web Serial unavailable — use Chrome/Edge over HTTPS.", "err");
} else {
  log("Chrome/Edge detected. Fill the form, connect USB, then flash.");
}
