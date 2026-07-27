/**
 * Interactive pin-accurate wiring diagram from the reference netlist.
 */
import { MODULES, REFERENCE_NETS } from "./netlist.js";

const LAYOUT = {
  esp32: { x: 320, y: 40, w: 160, h: 340 },
  mic: { x: 40, y: 40, w: 140, h: 180 },
  amp: { x: 40, y: 250, w: 140, h: 200 },
  l298n: { x: 560, y: 40, w: 150, h: 320 },
  spk: { x: 40, y: 480, w: 140, h: 90 },
  mouth: { x: 560, y: 390, w: 150, h: 90 },
  tail: { x: 560, y: 500, w: 150, h: 90 },
  btn: { x: 320, y: 420, w: 160, h: 100 },
};

/**
 * @param {HTMLElement} host
 * @param {{ highlightGroup?: string|null, onSelectNet?: (netId:string)=>void }} opts
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
    rect.setAttribute("x", box.x);
    rect.setAttribute("y", box.y);
    rect.setAttribute("width", box.w);
    rect.setAttribute("height", box.h);
    rect.setAttribute("rx", "8");
    rect.setAttribute("fill", "#143552");
    rect.setAttribute("stroke", mod.color);
    rect.setAttribute("stroke-width", "2");
    g.appendChild(rect);

    const title = document.createElementNS(ns, "text");
    title.setAttribute("x", box.x + box.w / 2);
    title.setAttribute("y", box.y + 22);
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("fill", "#eef4f8");
    title.setAttribute("font-size", "13");
    title.setAttribute("font-weight", "700");
    title.setAttribute("font-family", "Figtree,sans-serif");
    title.textContent = mod.name;
    g.appendChild(title);

    if (mod.subtitle) {
      const sub = document.createElementNS(ns, "text");
      sub.setAttribute("x", box.x + box.w / 2);
      sub.setAttribute("y", box.y + 38);
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
      const startY = box.y + 56;
      const gap = Math.min(22, (box.h - 70) / Math.max(pins.length, 1));
      pins.forEach((pin, i) => {
        const cy = startY + i * gap;
        const cx = side === "left" ? box.x : box.x + box.w;
        const ep = `${mod.id}.${pin.id}`;
        pinPos.set(ep, { x: cx, y: cy, side });

        const dot = document.createElementNS(ns, "circle");
        dot.setAttribute("cx", cx);
        dot.setAttribute("cy", cy);
        dot.setAttribute("r", "5");
        dot.setAttribute("fill", pin.gnd ? "#666" : pin.power ? "#e8dcc8" : mod.color);
        dot.setAttribute("stroke", "#06101c");
        dot.setAttribute("stroke-width", "1");
        dot.classList.add("pin-dot");
        dot.dataset.ep = ep;
        g.appendChild(dot);

        const label = document.createElementNS(ns, "text");
        label.setAttribute("x", side === "left" ? cx + 10 : cx - 10);
        label.setAttribute("y", cy + 3);
        label.setAttribute("text-anchor", side === "left" ? "start" : "end");
        label.setAttribute("fill", "#eef4f8");
        label.setAttribute("font-size", "10");
        label.setAttribute("font-family", "ui-monospace,monospace");
        label.textContent = pin.label;
        g.appendChild(label);
      });
    };
    place(leftPins, "left");
    place(rightPins, "right");
    gMods.appendChild(g);
  }

  function route(a, b) {
    const pa = pinPos.get(a);
    const pb = pinPos.get(b);
    if (!pa || !pb) return "";
    const midX = (pa.x + pb.x) / 2;
    // Orthogonal-ish path
    return `M${pa.x} ${pa.y} C${midX} ${pa.y}, ${midX} ${pb.y}, ${pb.x} ${pb.y}`;
  }

  const wireEls = [];
  for (const net of REFERENCE_NETS) {
    const [a, b] = net.endpoints;
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", route(a, b));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", net.color);
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-opacity", "0.85");
    path.classList.add("net-wire");
    path.dataset.net = net.id;
    path.dataset.group = net.group;
    path.dataset.name = net.name;
    path.style.cursor = "pointer";
    path.addEventListener("mouseenter", () => highlight(net.id));
    path.addEventListener("mouseleave", () => highlight(opts.highlightGroup ? null : null, opts.highlightGroup));
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

  // Filter chips outside
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
