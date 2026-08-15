# SomethingFishy

Turn a **Big Mouth Billy Bass** into an ESP32-S3 AI talking fish — complete with a GitHub Pages guide, wiring diagrams, bill of materials, firmware, and **in-browser flashing** (Wi‑Fi + OpenAI API key baked in at flash time).

## Live site

**https://techjeeper.github.io/SomethingFishy/**

Deployed automatically by the [Deploy GitHub Pages](.github/workflows/pages.yml) workflow (builds firmware, then publishes the site).

If the site 404s on first visit: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**, then re-run the workflow.

## What's included

| Path | Purpose |
|------|---------|
| `index.html` / `guide.html` / `wiring.html` / `bom.html` | Conversion guide site |
| `flash.html` | Web Serial flasher + config form |
| `firmware/` | PlatformIO firmware (mic → Whisper → GPT → TTS → lip-sync) |
| `firmware-bin/` | Built binaries (filled by CI) |
| `assets/diagrams/` | SVG wiring diagrams |

## Quick start

### 1. Hardware

Follow **[Parts](bom.html)** then **[Guide](guide.html)** and **[Wiring](wiring.html)**.

The recommended path **bypasses the stock microcontroller** — snip motor/speaker wires at the PCB and join with lever nuts (almost no soldering).

Default pin map (ESP32-S3):

- Mic INMP441: SD `8`, WS `9`, BCLK `10`, L/R→GND  
- Amp MAX98357A: DIN `11`, LRC `12`, BCLK `13`  
- L298N: IN1–4 → `16`, `17`, `4`, `5`  
- Talk button: `14` → GND  

### 2. Build firmware

```bash
cd firmware
pio run
```

Or push to GitHub and let the Pages / Build Firmware Actions produce `firmware-bin/`.

### 3. Flash from the website

1. Open `flash.html` in **Chrome** or **Edge** (HTTPS or localhost).
2. Enter Wi‑Fi (2.4 GHz) and OpenAI API key (+ optional personality).
3. Connect the ESP32-S3 over a **data** USB-C cable.
4. Click **Flash firmware + config**.

The page writes the app image and a `billycfg` partition containing your settings. Secrets are not uploaded to a server.

### 4. Talk

Serial monitor at `115200` on the **USB‑UART** port (CH343/CP210x), not the native USB CDC port. Look for `[billy] ready`. Hold the talk button or send `t`.

Speaker volume is set on the flash page (default **70%**). Lower it if speech buzzes or clips on USB power.

## Config partition

Layout matches `firmware/include/config_store.h` (`BillyConfig`, magic `0xF15C0001`) at flash offset `0x300000` (see `firmware/partitions.csv`). `speaker_volume` uses a former reserved byte (1–100; `0` = firmware default 70), so older configs still load.

## License

Project materials are provided for educational / maker use. Billy Bass is a trademark of its respective owners — this is an unofficial fan conversion guide.
