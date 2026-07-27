/**
 * Interactive pin-accurate wiring diagram from the reference netlist.
 * Pins face their partners; wires use orthogonal routing (no fake crossings).
 */
import { MODULES, REFERENCE_NETS } from "./netlist.js";
import { orthogonalPath, laneOffset } from "./wire-route.js";

const LAYOUT = {
  // Left column: audio in/out
  mic: { x: 24, y: 36, w: 150, h: 200 },
  amp: { x: 24, y: 260, w: 150, h: 220 },
  spk: { x: 24, y: 510, w: 150, h: 90 },
  // Center: MCU
  esp32: { x: 280, y: 80, w: 200, h: 360 },
  btn: { x: 300, y: 470, w: 160, h: 100 },
  // Right column: motors
  l298n: { x: 560, y: 36, w: 170, h: 340 },
  mouth: { x: 560, y: 400, w: 170, h: 90 },
  tail: { x: 560, y: 510, w: 170, h: 90 },
};

const GROUP_LANE = { power: 0, mic: 1, amp: 2, motor: 3, ui: 4 };

/**
 * @param {HTMLElement} host
 * @param {{ highlightGroup?: string|null, onSelectNet?: (netId:string, net:object)=>void }} opts
 */
export function mountWiringDiagram(host, opts = {}) {
  const pinPos = new Map();
  const vbW = 760;
  const vbH = 620;

  let svg = host.querySelector("svg.wire-diagram");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("wire-diagram");
    svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Interactive SomethingFishy wiring diagram");
    host.appendChild(svg);
  }
  svg.innerHTML = "";

  const ns = "http://www.w3.org/2000/svg";
  const gWires = document.createElementNS(ns, "g");
  gWires.classList.add("wires");
  const gMods = document.createElementNS(ns, "g");
  gMods.classList.add("modules");
  svg.appendChild(gWires);
  svg.appendChild(gMods);

  for (const mod of MODULES) {
    const box = LAYOUT[mod.id];
    if (!box) continue;
    const g = document.createElementNS(ns, "g");
    g.classList.add("module");
    g.dataset.module = mod.id;

    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", String(box.x));
    rect.setAttribute("y", String(box.y));
    rect.setAttribute("width", String(box.w));
    rect.setAttribute("height", String(box.h));
    rect.setAttribute("rx", "8");
    rect.setAttribute("fill", "#143552");
    rect.setAttribute("stroke", mod.color);
    rect.setAttribute("stroke-width", "2");
    g.appendChild(rect);

    const title = document.createElementNS(ns, "text");
    title.setAttribute("x", String(box.x + box.w / 2));
    title.setAttribute("y", String(box.y + 22));
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("fill", "#eef4f8");
    title.setAttribute("font-size", "13");
    title.setAttribute("font-weight", "700");
    title.setAttribute("font-family", "Figtree,sans-serif");
    title.textContent = mod.name;
    g.appendChild(title);

    if (mod.subtitle) {
      const sub = document.createElementNS(ns, "text");
      sub.setAttribute("x", String(box.x + box.w / 2));
      sub.setAttribute("y", String(box.y + 38));
      sub.setAttribute("text-anchor", "middle");
      sub.setAttribute("fill", "#9bb0c4");
      sub.setAttribute("font-size", "10");
      sub.setAttribute("font-family", "Figtree,sans-serif");
      sub.textContent = mod.subtitle;
      g.appendChild(sub);
    }

    const leftPins = mod.pins.filter((p) => (p.side || "left") === "left");
    const rightPins = mod.pins.filter((p) => p.side === "right");
    const place = (pins, side) => {
      const startY = box.y + 54;
      const gap = Math.min(20, (box.h - 68) / Math.max(pins.length, 1));
      pins.forEach((pin, i) => {
        const cy = startY + i * gap;
        const cx = side === "left" ? box.x : box.x + box.w;
        const ep = `${mod.id}.${pin.id}`;
        pinPos.set(ep, { x: cx, y: cy, side });

        const dot = document.createElementNS(ns, "circle");
        dot.setAttribute("cx", String(cx));
        dot.setAttribute("cy", String(cy));
        dot.setAttribute("r", "4.5");
        dot.setAttribute("fill", pin.gnd ? "#666" : pin.power ? "#e8dcc8" : mod.color);
        dot.setAttribute("stroke", "#06101c");
        dot.setAttribute("stroke-width", "1");
        dot.classList.add("pin-dot");
        dot.dataset.ep = ep;
        g.appendChild(dot);

        const label = document.createElementNS(ns, "text");
        const inward = side === "left" ? cx + 9 : cx - 9;
        label.setAttribute("x", String(inward));
        label.setAttribute("y", String(cy + 3));
        label.setAttribute("text-anchor", side === "left" ? "start" : "end");
        label.setAttribute("fill", "#eef4f8");
        label.setAttribute("font-size", "9.5");
        label.setAttribute("font-family", "ui-monospace,monospace");
        label.textContent = pin.label;
        g.appendChild(label);
      });
    };
    place(leftPins, "left");
    place(rightPins, "right");
    gMods.appendChild(g);
  }

  // Local jumper (mic L/R to mic GND) — draw as short arc on module
  const wireEls = [];
  let gi = 0;
  for (const net of REFERENCE_NETS) {
    const [a, b] = net.endpoints;
    const pa = pinPos.get(a);
    const pb = pinPos.get(b);
    if (!pa || !pb) continue;

    const path = document.createElementNS(ns, "path");
    const lane = laneOffset(net.id, GROUP_LANE[net.group] || 0) + (gi++ % 5) * 0.5;
    path.setAttribute("d", orthogonalPath(pa, pb, lane));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", net.color);
    path.setAttribute("stroke-width", net.group === "power" ? "2.25" : "2");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-opacity", "0.92");
    path.classList.add("net-wire");
    path.dataset.net = net.id;
    path.dataset.group = net.group;
    path.dataset.name = net.name;
    path.style.cursor = "pointer";
    path.addEventListener("mouseenter", () => highlight(net.id));
    path.addEventListener("mouseleave", () => highlight(null, opts.highlightGroup || null));
    path.addEventListener("click", () => {
      highlight(net.id);
      opts.onSelectNet?.(net.id, net);
    });
    gWires.appendChild(path);
    wireEls.push(path);
  }

  function highlight(netId, group) {
    for (const el of wireEls) {
      const on =
        (netId && el.dataset.net === netId) ||
        (group && el.dataset.group === group);
      el.classList.toggle("is-hot", Boolean(on));
      el.classList.toggle("is-dim", Boolean(netId || group) && !on);
    }
  }

  return {
    highlight,
    highlightGroup(group) {
      opts.highlightGroup = group;
      highlight(null, group || null);
    },
    clear() {
      opts.highlightGroup = null;
      highlight(null, null);
    },
    nets: REFERENCE_NETS,
    pinPos,
  };
}
