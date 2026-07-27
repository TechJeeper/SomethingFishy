#!/usr/bin/env python3
from pathlib import Path
import re

for p in Path(".").glob("*.html"):
    t = p.read_text(encoding="utf-8")
    t2 = t.replace('href="css/styles.css"', 'href="css/styles.css?v=3"')
    t2 = t2.replace('src="js/main.js"', 'src="js/main.js?v=3"')
    t2 = t2.replace('src="js/flash.js"', 'src="js/flash.js?v=3"')
    t2 = t2.replace('href="assets/icons/favicon.svg"', 'href="assets/icons/favicon.svg?v=3"')
    t2 = re.sub(r'(src="assets/[^"]+\.svg)(?:\?v=\d+)?"', r'\1?v=3"', t2)
    if t2 != t:
        p.write_text(t2, encoding="utf-8")
        print("updated", p)
    else:
        print("noop", p)
