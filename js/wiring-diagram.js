/**
 * Pin-accurate wiring diagram with single-net focus.
 * Only one (or one group) of wires is drawn at a time so endpoints stay obvious.
 */
import { MODULES, REFERENCE_NETS } from "./netlist.js";
import { orthogonalPath, laneOffset } from "./wire-route.js";

const LAYOUT = {
  mic: { x: 24, y: 36, w: 150, h: 200 },
  amp: { x: 24, y: 260, w: 150, h: 220 },
  spk: { x: 24, y: 510, w: 150, h: 90 },
  esp32: { x: 280, y: 80, w: 200, h: 360 },
  btn: { x: 300, y: 470, w: 160, h: 100 },
  l298n: { x: 560, y: 36, w: 170, h: 340 },
  mouth: { x: 560, y: 400, w: 170, h: 90 },
  tail: { x: 560, y: 510, w: 170, h: 90 },
};

/**
 * @param {HTMLElement} host - diagram SVG host
 * @param {object} opts
 * @param {HTMLElement} [opts.listEl] - connection list container
 * @param {HTMLElement} [opts.detailEl] - detail text element
 * @param {(net: object|null)=>void} [opts.onSelectNet]
 */
export function mountWiringDiagram(host, opts = {}) {
  const pinPos = new Map();
  const vbW = 760;
  const vbH = 620;
  /** @type {string|null} */
  let activeNetId = null;
  /** @type {string|null} */
  let activeGroup = null;
  /** @type {string|null} */
  let activePin = null;

  let svg = host.querySelector("svg.wire-diagram");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("wire-diagram");
    svg.setAttribute("viewBox", `0 0 ${vbW} ${vbH}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "SomethingFishy pin wiring diagram");
    host.appendChild(svg);
  }

  const ns = "http://www.w3.org/2000/svg";

  function drawModules() {
    svg.innerHTML = "";
    pinPos.clear();
    const gMods = document.createElementNS(ns, "g");
    gMods.classList.add("modules");
    const gWires = document.createElementNS(ns, "g");
    gWires.classList.add("wires");
    gWires.dataset.layer = "wires";
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
          pinPos.set(ep, { x: cx, y: cy, side, label: pin.label, module: mod.name });

          const hit = document.createElementNS(ns, "circle");
          hit.setAttribute("cx", String(cx));
          hit.setAttribute("cy", String(cy));
          hit.setAttribute("r", "11");
          hit.setAttribute("fill", "transparent");
          hit.style.cursor = "pointer";
          hit.dataset.ep = ep;
          hit.addEventListener("click", (e) => {
            e.stopPropagation();
            selectPin(ep);
          });
          g.appendChild(hit);

          const dot = document.createElementNS(ns, "circle");
          dot.setAttribute("cx", String(cx));
          dot.setAttribute("cy", String(cy));
          dot.setAttribute("r", "5");
          dot.setAttribute("fill", pin.gnd ? "#666" : pin.power ? "#e8dcc8" : mod.color);
          dot.setAttribute("stroke", "#06101c");
          dot.setAttribute("stroke-width", "1");
          dot.classList.add("pin-dot");
          dot.dataset.ep = ep;
          g.appendChild(dot);

          const label = document.createElementNS(ns, "text");
          const inward = side === "left" ? cx + 10 : cx - 10;
          label.setAttribute("x", String(inward));
          label.setAttribute("y", String(cy + 3));
          label.setAttribute("text-anchor", side === "left" ? "start" : "end");
          label.setAttribute("fill", "#eef4f8");
          label.setAttribute("font-size", "9.5");
          label.setAttribute("font-family", "ui-monospace,monospace");
          label.style.pointerEvents = "none";
          label.textContent = pin.label;
          g.appendChild(label);
        });
      };
      place(leftPins, "left");
      place(rightPins, "right");
      gMods.appendChild(g);
    }
  }

  function netsForView() {
    if (activeNetId) return REFERENCE_NETS.filter((n) => n.id === activeNetId);
    if (activePin) {
      return REFERENCE_NETS.filter(
        (n) => n.endpoints[0] === activePin || n.endpoints[1] === activePin
      );
    }
    if (activeGroup) return REFERENCE_NETS.filter((n) => n.group === activeGroup);
    return []; // nothing until selection — clarity first
  }

  function drawEndpointBadge(g, ep, color) {
    const p = pinPos.get(ep);
    if (!p) return;
    const ring = document.createElementNS(ns, "circle");
    ring.setAttribute("cx", String(p.x));
    ring.setAttribute("cy", String(p.y));
    ring.setAttribute("r", "9");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", color);
    ring.setAttribute("stroke-width", "2.5");
    ring.classList.add("ep-ring");
    g.appendChild(ring);

    // Outside label callout
    const outward = p.side === "left" ? p.x - 8 : p.x + 8;
    const anchor = p.side === "left" ? "end" : "start";
    const bgX = p.side === "left" ? outward - 4 : outward - 2;
    const text = `${p.module} · ${p.label}`;
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(outward));
    label.setAttribute("y", String(p.y - 12));
    label.setAttribute("text-anchor", anchor);
    label.setAttribute("fill", color);
    label.setAttribute("font-size", "11");
    label.setAttribute("font-weight", "700");
    label.setAttribute("font-family", "Figtree,sans-serif");
    label.textContent = text;
    g.appendChild(label);
  }

  function drawWires() {
    const gWires = svg.querySelector('[data-layer="wires"]');
    if (!gWires) return;
    gWires.innerHTML = "";

    const nets = netsForView();

    // Dim hint when nothing selected
    if (!nets.length) {
      const hint = document.createElementNS(ns, "text");
      hint.setAttribute("x", String(vbW / 2));
      hint.setAttribute("y", "30");
      hint.setAttribute("text-anchor", "middle");
      hint.setAttribute("fill", "#9bb0c4");
      hint.setAttribute("font-size", "13");
      hint.setAttribute("font-family", "Figtree,sans-serif");
      hint.textContent = "Click a pin or pick a connection below — one wire at a time";
      gWires.appendChild(hint);
      return;
    }

    nets.forEach((net, i) => {
      const [a, b] = net.endpoints;
      const pa = pinPos.get(a);
      const pb = pinPos.get(b);
      if (!pa || !pb) return;

      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", orthogonalPath(pa, pb, laneOffset(net.id, i)));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", net.color);
      path.setAttribute("stroke-width", "3");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-linecap", "round");
      path.classList.add("net-wire", "is-hot");
      gWires.appendChild(path);

      drawEndpointBadge(gWires, a, net.color);
      drawEndpointBadge(gWires, b, net.color);

      // Mid-wire caption
      const midX = (pa.x + pb.x) / 2;
      const midY = (pa.y + pb.y) / 2 - 8;
      const cap = document.createElementNS(ns, "text");
      cap.setAttribute("x", String(midX));
      cap.setAttribute("y", String(midY));
      cap.setAttribute("text-anchor", "middle");
      cap.setAttribute("fill", "#eef4f8");
      cap.setAttribute("font-size", "12");
      cap.setAttribute("font-weight", "700");
      cap.setAttribute("font-family", "Figtree,sans-serif");
      cap.textContent = net.name;
      gWires.appendChild(cap);
    });

    // Mark active pin dots
    svg.querySelectorAll(".pin-dot").forEach((dot) => {
      const ep = dot.dataset.ep;
      const on = nets.some((n) => n.endpoints.includes(ep));
      dot.classList.toggle("is-endpoint", on);
      dot.setAttribute("r", on ? "7" : "5");
    });
  }

  function updateDetail(nets) {
    if (!opts.detailEl) return;
    if (!nets.length) {
      opts.detailEl.innerHTML =
        "Pick a <strong>connection</strong> in the list, or click a <strong>pin</strong> on a module.";
      return;
    }
    opts.detailEl.innerHTML = nets
      .map(
        (n) =>
          `<strong>${n.name}</strong><br><code>${n.endpoints[0]}</code> ↔ <code>${n.endpoints[1]}</code>`
      )
      .join("<hr style='border:none;border-top:1px solid var(--line);margin:0.5rem 0'>");
  }

  function syncList() {
    if (!opts.listEl) return;
    opts.listEl.querySelectorAll("[data-net]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.net === activeNetId);
    });
  }

  function selectNet(netId) {
    activeNetId = netId;
    activeGroup = null;
    activePin = null;
    const net = REFERENCE_NETS.find((n) => n.id === netId) || null;
    const nets = net ? [net] : [];
    drawWires();
    updateDetail(nets);
    syncList();
    opts.onSelectNet?.(net);
  }

  function selectPin(ep) {
    activePin = ep;
    activeNetId = null;
    activeGroup = null;
    const nets = netsForView();
    drawWires();
    updateDetail(nets);
    syncList();
    opts.onSelectNet?.(nets[0] || null);
  }

  function selectGroup(group) {
    activeGroup = group || null;
    activeNetId = null;
    activePin = null;
    const nets = netsForView();
    drawWires();
    updateDetail(
      nets.length
        ? [{ name: `${nets.length} nets in “${group}” — pick one from the list for a single wire`, endpoints: ["", ""] }]
        : []
    );
    // For groups, still draw but user asked for clarity — limit group draw to list selection only
    if (group) {
      // show group in list filter only; don't draw all group wires
      activeGroup = null;
      if (opts.listEl) {
        opts.listEl.querySelectorAll("[data-net]").forEach((el) => {
          const net = REFERENCE_NETS.find((n) => n.id === el.dataset.net);
          el.hidden = Boolean(group && net && net.group !== group);
        });
      }
      drawWires();
      updateDetail([]);
      if (opts.detailEl) {
        opts.detailEl.innerHTML = `Filtered to <strong>${group}</strong>. Click a connection in the list.`;
      }
    } else if (opts.listEl) {
      opts.listEl.querySelectorAll("[data-net]").forEach((el) => {
        el.hidden = false;
      });
      drawWires();
      updateDetail([]);
    }
    syncList();
  }

  function buildList() {
    if (!opts.listEl) return;
    opts.listEl.innerHTML = "";
    for (const net of REFERENCE_NETS) {
      const li = document.createElement("li");
      li.dataset.net = net.id;
      li.dataset.group = net.group;
      li.innerHTML = `
        <button type="button" class="wire-list-btn">
          <span class="wire-list-swatch" style="background:${net.color}"></span>
          <span class="wire-list-body">
            <strong>${net.name}</strong>
            <code>${net.endpoints[0]}</code>
            <span class="wire-list-arrow">→</span>
            <code>${net.endpoints[1]}</code>
          </span>
        </button>`;
      li.querySelector("button").addEventListener("click", () => selectNet(net.id));
      opts.listEl.appendChild(li);
    }
  }

  drawModules();
  buildList();
  drawWires();
  updateDetail([]);

  // Select first mic net as a friendly default so the page isn't empty
  const first = REFERENCE_NETS.find((n) => n.id === "mic_sd") || REFERENCE_NETS[0];
  if (first) selectNet(first.id);

  return {
    selectNet,
    selectPin,
    selectGroup,
    clear() {
      selectGroup("");
      activeNetId = null;
      activePin = null;
      drawWires();
      updateDetail([]);
      syncList();
    },
    highlightGroup(group) {
      selectGroup(group || "");
    },
    nets: REFERENCE_NETS,
  };
}
