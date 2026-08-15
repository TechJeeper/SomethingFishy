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
  const moduleById = new Map(MODULES.map((mod) => [mod.id, mod]));
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

  function endpointMeta(ep) {
    const [moduleId, pinId] = String(ep || "").split(".");
    const mod = moduleById.get(moduleId);
    const pin = mod?.pins.find((p) => p.id === pinId);
    return {
      ep,
      moduleId,
      pinId,
      moduleName: mod?.name || moduleId || ep,
      pinLabel: pin?.label || pinId || ep,
      fullLabel: mod ? `${mod.name} · ${pin?.label || pinId}` : ep,
    };
  }

  function filteredNets() {
    return REFERENCE_NETS.filter((net) => {
      if (activeGroup && net.group !== activeGroup) return false;
      if (activePin && !net.endpoints.includes(activePin)) return false;
      return true;
    });
  }

  function currentNet() {
    const nets = filteredNets();
    return nets.find((net) => net.id === activeNetId) || nets[0] || null;
  }

  function refreshSelection() {
    const nets = filteredNets();
    if (!nets.length) {
      activeNetId = null;
      return { nets, net: null };
    }
    if (!nets.some((net) => net.id === activeNetId)) {
      activeNetId = nets[0].id;
    }
    return { nets, net: nets.find((item) => item.id === activeNetId) || nets[0] };
  }

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

    const net = currentNet();

    // Dim hint when nothing selected
    if (!net) {
      const hint = document.createElementNS(ns, "text");
      hint.setAttribute("x", String(vbW / 2));
      hint.setAttribute("y", "30");
      hint.setAttribute("text-anchor", "middle");
      hint.setAttribute("fill", "#9bb0c4");
      hint.setAttribute("font-size", "13");
      hint.setAttribute("font-family", "Figtree,sans-serif");
      hint.textContent = activePin || activeGroup
        ? "No matching connection in this filter"
        : "Click a pin or pick a connection below — one wire at a time";
      gWires.appendChild(hint);
      return;
    }

    const [a, b] = net.endpoints;
    const pa = pinPos.get(a);
    const pb = pinPos.get(b);
    if (!pa || !pb) return;

    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", orthogonalPath(pa, pb, laneOffset(net.id, 0)));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", net.color);
    path.setAttribute("stroke-width", "3");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-linecap", "round");
    path.classList.add("net-wire", "is-hot");
    gWires.appendChild(path);

    drawEndpointBadge(gWires, a, net.color);
    drawEndpointBadge(gWires, b, net.color);

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

    // Mark active pin dots
    svg.querySelectorAll(".pin-dot").forEach((dot) => {
      const ep = dot.dataset.ep;
      const on = net.endpoints.includes(ep) || ep === activePin;
      dot.classList.toggle("is-endpoint", on);
      dot.setAttribute("r", on ? "7" : "5");
    });
  }

  function updateDetail(nets, net) {
    if (!opts.detailEl) return;
    if (!net) {
      opts.detailEl.innerHTML = activePin
        ? `No connections found for <code>${endpointMeta(activePin).fullLabel}</code>.`
        : activeGroup
          ? `No connections found in the <strong>${activeGroup}</strong> filter.`
          : "Pick a <strong>connection</strong> in the list, or click a <strong>pin</strong> on a module.";
      return;
    }
    const from = endpointMeta(net.endpoints[0]);
    const to = endpointMeta(net.endpoints[1]);
    const scope = activePin
      ? `<span class="wire-trace-kicker">Tracing from <code>${endpointMeta(activePin).fullLabel}</code> · ${nets.length} match${nets.length === 1 ? "" : "es"}</span>`
      : activeGroup
        ? `<span class="wire-trace-kicker">${net.group.toUpperCase()} connection · ${nets.length} in this filter</span>`
        : `<span class="wire-trace-kicker">Trace this wire</span>`;
    opts.detailEl.innerHTML = `
      <div class="wire-trace-card">
        ${scope}
        <strong>${net.name}</strong>
        <div class="wire-trace-route">
          <div class="wire-trace-end">
            <span>From</span>
            <b>${from.moduleName}</b>
            <code>${from.pinLabel}</code>
          </div>
          <span class="wire-trace-arrow" aria-hidden="true">→</span>
          <div class="wire-trace-end">
            <span>To</span>
            <b>${to.moduleName}</b>
            <code>${to.pinLabel}</code>
          </div>
        </div>
        <p>Start at <code>${from.fullLabel}</code> and land the other end on <code>${to.fullLabel}</code>.</p>
      </div>`;
  }

  function syncList() {
    if (!opts.listEl) return;
    const visible = new Set(filteredNets().map((net) => net.id));
    opts.listEl.querySelectorAll("[data-net]").forEach((el) => {
      el.hidden = !visible.has(el.dataset.net);
      el.classList.toggle("is-active", el.dataset.net === activeNetId);
    });
  }

  function selectNet(netId) {
    const net = REFERENCE_NETS.find((n) => n.id === netId) || null;
    if (!net) return;
    activeNetId = netId;
    if (activePin && !net.endpoints.includes(activePin)) activePin = null;
    if (activeGroup && net.group !== activeGroup) activeGroup = null;
    const { nets, net: current } = refreshSelection();
    drawWires();
    updateDetail(nets, current);
    syncList();
    opts.onSelectNet?.(current);
  }

  function selectPin(ep) {
    activePin = ep;
    activeGroup = null;
    const { nets, net } = refreshSelection();
    drawWires();
    updateDetail(nets, net);
    syncList();
    opts.onSelectNet?.(net);
  }

  function selectGroup(group) {
    activeGroup = group || null;
    activePin = null;
    const { nets, net } = refreshSelection();
    drawWires();
    updateDetail(nets, net);
    syncList();
    opts.onSelectNet?.(net);
  }

  function buildList() {
    if (!opts.listEl) return;
    opts.listEl.innerHTML = "";
    for (const net of REFERENCE_NETS) {
      const from = endpointMeta(net.endpoints[0]);
      const to = endpointMeta(net.endpoints[1]);
      const li = document.createElement("li");
      li.dataset.net = net.id;
      li.dataset.group = net.group;
      li.innerHTML = `
        <button type="button" class="wire-list-btn">
          <span class="wire-list-swatch" style="background:${net.color}"></span>
          <span class="wire-list-body">
            <strong>${net.name}</strong>
            <span class="wire-list-route">
              <span class="wire-list-end">
                <small>From</small>
                <span>${from.moduleName}</span>
                <code>${from.pinLabel}</code>
              </span>
              <span class="wire-list-arrow">→</span>
              <span class="wire-list-end">
                <small>To</small>
                <span>${to.moduleName}</span>
                <code>${to.pinLabel}</code>
              </span>
            </span>
          </span>
        </button>`;
      li.querySelector("button").addEventListener("click", () => selectNet(net.id));
      opts.listEl.appendChild(li);
    }
  }

  drawModules();
  buildList();
  drawWires();
  updateDetail([], null);

  // Select first mic net as a friendly default so the page isn't empty
  const first = REFERENCE_NETS.find((n) => n.id === "mic_sd") || REFERENCE_NETS[0];
  if (first) selectNet(first.id);

  return {
    selectNet,
    selectPin,
    selectGroup,
    clear() {
      activeGroup = null;
      activePin = null;
      activeNetId = null;
      drawWires();
      updateDetail([], null);
      syncList();
    },
    highlightGroup(group) {
      selectGroup(group || "");
    },
    nets: REFERENCE_NETS,
  };
}
