# Firmware binaries

This folder is populated by GitHub Actions (or a local `pio run`).

Expected files for a full factory flash:

| File | Offset |
|------|--------|
| `bootloader.bin` | `0x0` |
| `partitions.bin` | `0x8000` |
| `boot_app0.bin` | `0xE000` |
| `firmware.bin` | `0x10000` |

The web flasher always writes a generated `billycfg` blob at `0x300000`.

If only `firmware.bin` is present, flashing still works on boards that already have a bootloader (typical after one PlatformIO upload).
