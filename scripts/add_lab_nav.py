#!/usr/bin/env python3
"""Insert Lab nav link into site HTML pages if missing."""
from pathlib import Path
import re

NAV_LAB = '        <li><a href="lab.html">Lab</a></li>\n'
PATTERN = re.compile(
    r'(<li><a href="wiring\.html"[^>]*>Wiring</a></li>\n)(\s*<li><a href="lab\.html")?',
    re.M,
)

for p in Path(".").glob("*.html"):
    t = p.read_text(encoding="utf-8")
    if "lab.html" in t and 'href="lab.html"' in t and p.name != "lab.html":
        # ensure nav has Lab after Wiring
        if re.search(r'wiring\.html.*\n\s*<li><a href="lab\.html"', t):
            print("nav ok", p.name)
            continue
    def repl(m):
        if m.group(2):
            return m.group(0)
        return m.group(1) + NAV_LAB

    t2, n = PATTERN.subn(repl, t, count=1)
    # bump cache versions lightly for pages we touch
    t2 = t2.replace("?v=3", "?v=4")
    if t2 != t:
        p.write_text(t2, encoding="utf-8")
        print("updated", p.name, "subs", n)
    else:
        print("noop", p.name)
