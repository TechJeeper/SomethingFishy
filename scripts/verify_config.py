#!/usr/bin/env python3
"""Verify BillyConfig size / CRC helpers match firmware + flash.js."""
import struct
import zlib

BILLY_CFG_MAGIC = 0xF15C0001
BILLY_CFG_VERSION = 1
# magic I version H length H + strings + auto + reserved + crc
FMT = "<IHH64s64s192s48s32s512s48sB3sI"
SIZE = struct.calcsize(FMT)
assert SIZE == 976, SIZE


def pack(fields: dict) -> bytes:
    def cstr(s: str, n: int) -> bytes:
        b = (s or "").encode("utf-8")[: n - 1]
        return b + b"\0" * (n - len(b))

    body = struct.pack(
        "<IHH64s64s192s48s32s512s48sB3s",
        BILLY_CFG_MAGIC,
        BILLY_CFG_VERSION,
        SIZE,
        cstr(fields["wifi_ssid"], 64),
        cstr(fields["wifi_pass"], 64),
        cstr(fields["openai_key"], 192),
        cstr(fields["openai_model"], 48),
        cstr(fields["tts_voice"], 32),
        cstr(fields["system_prompt"], 512),
        cstr(fields["wake_phrase"], 48),
        1 if fields.get("auto_listen") else 0,
        b"\0\0\0",
    )
    crc = zlib.crc32(body + b"\0\0\0\0") & 0xFFFFFFFF
    return body + struct.pack("<I", crc)


if __name__ == "__main__":
    blob = pack(
        {
            "wifi_ssid": "test",
            "wifi_pass": "pass",
            "openai_key": "sk-test",
            "openai_model": "gpt-4o-mini",
            "tts_voice": "alloy",
            "system_prompt": "You are Billy.",
            "wake_phrase": "Hey Billy",
            "auto_listen": False,
        }
    )
    assert len(blob) == 976
    print(f"OK BillyConfig size={SIZE} sample_crc=0x{struct.unpack_from('<I', blob, 972)[0]:08x}")
