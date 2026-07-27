# SomethingFishy firmware

ESP32-S3 Arduino/PlatformIO firmware for the Billy Bass AI conversion.

## Features

- Loads Wi‑Fi + OpenAI settings from the `billycfg` flash partition (written by `flash.html`)
- I²S mic capture (INMP441) → WAV → Whisper transcription
- Chat Completions with a customizable system prompt
- TTS PCM (`tts-1`, 24 kHz) → MAX98357A speaker
- Mouth lip-sync from outbound audio RMS; occasional tail flops

## Build

```bash
pio run -e esp32-s3
pio run -e esp32-s3 -t upload
pio device monitor
```

## Serial commands

| Key | Action |
|-----|--------|
| `t` | Run one conversation turn |
| `m` | Mouth open/close test |
| `x` | Stop motors |
| `h` | Help |

## Partition table

See `partitions.csv`. Application at `0x10000`, config at `0x300000`.
