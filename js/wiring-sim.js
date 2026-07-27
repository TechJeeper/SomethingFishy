/**
 * Wiring Lab — pin click wiring, validation, signal-flow sim.
 * Uses a connection list (not cross-card Bezier spaghetti) plus pin highlighting.
 */
import { MODULES, referenceWires, validateWiring } from "./netlist.js";

/**
 * @param {HTMLElement} root
 */
export function mountWiringLab(root) {
  /** @type {{a:string,b:string,id:string,name?:string,color?:string,group?:string}[]} */
  let wires = [];
  let selected = null;
  let simRunning = false;
  let hoverWireId = null;

  root.innerHTML = `
    <div class="lab-toolbar">
      <button type="button" class="btn btn-secondary" data-act="load">Load reference design</button>
      <button type="button" class="btn btn-secondary" data-act="clear">Clear wires</button>
      <button type="button" class="btn btn-primary" data-act="validate">Validate wiring</button>
      <button type="button" class="btn btn-primary" data-act="simulate" disabled>Simulate talk turn</button>
      <span class="status-pill" data-status>No wires yet</span>
    </div>
    <p class="lab-hint">Click a pin, then another pin, to add a wire. Connections appear in the list — hover a row to highlight both pins.</p>
    <div class="lab-grid">
      <div class="lab-board" data-board></div>
      <aside class="lab-side">
        <h3>Connections <span data-wire-count class="lab-count">0</span></h3>
        <ul class="lab-conn-list" data-conn-list></ul>
        <h3>Validation</h3>
        <div class="lab-results" data-results><p class="field-hint">Run validate to check electrical rules against the firmware pin map.</p></div>
        <h3>Signal flow</h3>
        <ol class="lab-flow" data-flow>
          <li data-step="idle">Idle</li>
          <li data-step="btn">Talk button / serial <code>t</code></li>
          <li data-step="mic">INMP441 capture (I2S RX)</li>
          <li data-step="cloud">Whisper → GPT → TTS</li>
          <li data-step="amp">MAX98357A playback (I2S TX)</li>
          <li data-step="motor">Mouth lip-sync + tail flop</li>
        </ol>
        <div class="lab-fish" data-fish aria-hidden="true">
          <div class="lab-fish-body"></div>
          <div class="lab-fish-mouth"></div>
          <div class="lab-fish-tail"></div>
        </div>
      </aside>
    </div>
  `;

  const board = root.querySelector("[data-board]");
  const resultsEl = root.querySelector("[data-results]");
  const statusEl = root.querySelector("[data-status]");
  const flowEl = root.querySelector("[data-flow]");
  const fishEl = root.querySelector("[data-fish]");
  const connList = root.querySelector("[data-conn-list]");
  const wireCount = root.querySelector("[data-wire-count]");
  const btnSim = root.querySelector('[data-act="simulate"]');

  for (const mod of MODULES) {
    const card = document.createElement("article");
    card.className = "lab-module";
    card.dataset.module = mod.id;
    card.style.setProperty("--mod-accent", mod.color);
    card.innerHTML = `<header><strong>${mod.name}</strong><span>${mod.subtitle || ""}</span></header><ul class="lab-pins"></ul>`;
    const ul = card.querySelector(".lab-pins");
    for (const pin of mod.pins) {
      const li = document.createElement("li");
      const ep = `${mod.id}.${pin.id}`;
      li.innerHTML = `<button type="button" class="lab-pin" data-ep="${ep}" title="${ep}"><i></i><span>${pin.label}</span></button>`;
      ul.appendChild(li);
    }
    board.appendChild(card);
  }

  function setStatus(text, state) {
    statusEl.textContent = text;
    statusEl.classList.remove("connected", "error");
    if (state) statusEl.classList.add(state);
  }

  function shortEp(ep) {
    return ep.replace(/^[^.]+\./, "");
  }

  function moduleOf(ep) {
    return ep.split(".")[0];
  }

  function refreshPins() {
    root.querySelectorAll(".lab-pin").forEach((el) => {
      const ep = el.dataset.ep;
      const used = wires.some((w) => w.a === ep || w.b === ep);
      const hot =
        ep === selected ||
        (hoverWireId &&
          wires.some((w) => w.id === hoverWireId && (w.a === ep || w.b === ep)));
      el.classList.toggle("is-selected", ep === selected);
      el.classList.toggle("is-wired", used);
      el.classList.toggle("is-hot-pair", Boolean(hot && ep !== selected));
    });
  }

  function renderConnList() {
    wireCount.textContent = String(wires.length);
    connList.innerHTML = "";
    if (!wires.length) {
      connList.innerHTML = `<li class="lab-conn-empty">No wires yet</li>`;
      return;
    }
    for (const w of wires) {
      const li = document.createElement("li");
      li.className = "lab-conn";
      li.dataset.wire = w.id;
      li.innerHTML = `
        <button type="button" class="lab-conn-btn" data-wire="${w.id}">
          <span class="lab-conn-swatch" style="background:${w.color || "#3dbeb0"}"></span>
          <span class="lab-conn-text">
            <strong>${moduleOf(w.a)}.${shortEp(w.a)}</strong>
            <span class="lab-conn-arrow">↔</span>
            <strong>${moduleOf(w.b)}.${shortEp(w.b)}</strong>
            ${w.name ? `<em>${w.name}</em>` : ""}
          </span>
        </button>
        <button type="button" class="lab-conn-del" data-del="${w.id}" title="Remove">×</button>`;
      connList.appendChild(li);
    }
  }

  function redraw() {
    renderConnList();
    refreshPins();
  }

  function addWire(a, b) {
    if (a === b) return;
    const id = [a, b].sort().join("|");
    if (wires.some((w) => w.id === id)) return;
    wires.push({ a, b, id, color: "#3dbeb0" });
    setStatus(`${wires.length} wire(s)`, "connected");
    btnSim.disabled = true;
    redraw();
  }

  board.addEventListener("click", (e) => {
    const btn = e.target.closest(".lab-pin");
    if (!btn) return;
    const ep = btn.dataset.ep;
    if (!selected) {
      selected = ep;
      refreshPins();
      return;
    }
    addWire(selected, ep);
    selected = null;
    refreshPins();
  });

  connList.addEventListener("mouseover", (e) => {
    const row = e.target.closest("[data-wire]");
    hoverWireId = row?.dataset.wire || null;
    refreshPins();
  });
  connList.addEventListener("mouseleave", () => {
    hoverWireId = null;
    refreshPins();
  });
  connList.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      wires = wires.filter((w) => w.id !== del.dataset.del);
      btnSim.disabled = true;
      setStatus(wires.length ? `${wires.length} wire(s)` : "No wires yet", wires.length ? "connected" : undefined);
      redraw();
      return;
    }
    const row = e.target.closest("[data-wire]");
    if (row) {
      hoverWireId = row.dataset.wire;
      refreshPins();
    }
  });

  root.querySelector('[data-act="load"]').addEventListener("click", () => {
    wires = referenceWires().map((w) => ({
      a: w.a,
      b: w.b,
      id: [w.a, w.b].sort().join("|"),
      color: w.color,
      name: w.name,
      group: w.group,
    }));
    selected = null;
    hoverWireId = null;
    setStatus(`Reference design loaded (${wires.length} wires)`, "connected");
    btnSim.disabled = true;
    resultsEl.innerHTML = `<p class="field-hint">Reference design loaded. Click <strong>Validate wiring</strong>.</p>`;
    redraw();
  });

  root.querySelector('[data-act="clear"]').addEventListener("click", () => {
    wires = [];
    selected = null;
    hoverWireId = null;
    btnSim.disabled = true;
    setStatus("No wires yet");
    resultsEl.innerHTML = `<p class="field-hint">Cleared. Load reference or click pins to wire.</p>`;
    setFlow(null);
    fishEl.classList.remove("is-talking");
    redraw();
  });

  root.querySelector('[data-act="validate"]').addEventListener("click", () => {
    const report = validateWiring(wires);
    resultsEl.innerHTML = "";
    const summary = document.createElement("p");
    summary.className = report.pass ? "lab-pass" : "lab-fail";
    summary.textContent = report.pass
      ? `PASS — ${report.score}/${report.total} required nets OK. Safe to build.`
      : `FAIL — ${report.score}/${report.total} required nets OK. Fix issues below.`;
    resultsEl.appendChild(summary);

    const ul = document.createElement("ul");
    ul.className = "lab-check-list";
    for (const r of report.results) {
      const li = document.createElement("li");
      li.className = r.ok ? "ok" : r.severity === "danger" ? "danger" : "bad";
      li.textContent = `${r.ok ? "OK" : "X"} ${r.label}`;
      ul.appendChild(li);
    }
    resultsEl.appendChild(ul);
    setStatus(report.pass ? "Validated — ready to simulate" : "Validation failed", report.pass ? "connected" : "error");
    btnSim.disabled = !report.pass;
  });

  function setFlow(step) {
    flowEl.querySelectorAll("[data-step]").forEach((li) => {
      li.classList.toggle("is-active", li.dataset.step === step);
      li.classList.remove("is-done");
    });
    if (!step) return;
    const order = ["idle", "btn", "mic", "cloud", "amp", "motor"];
    const idx = order.indexOf(step);
    order.forEach((s, i) => {
      const li = flowEl.querySelector(`[data-step="${s}"]`);
      if (li && i < idx) li.classList.add("is-done");
    });
  }

  function pulse(eps, on) {
    eps.forEach((ep) => {
      root.querySelector(`.lab-pin[data-ep="${ep}"]`)?.classList.toggle("is-live", on);
    });
  }

  async function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  root.querySelector('[data-act="simulate"]').addEventListener("click", async () => {
    if (simRunning) return;
    simRunning = true;
    btnSim.disabled = true;
    setStatus("Simulating talk turn…", "connected");

    setFlow("btn");
    pulse(["esp32.GPIO14", "btn.SIG"], true);
    await sleep(700);
    pulse(["esp32.GPIO14", "btn.SIG"], false);

    setFlow("mic");
    pulse(["esp32.GPIO8", "esp32.GPIO9", "esp32.GPIO10", "mic.SD", "mic.WS", "mic.SCK"], true);
    await sleep(1100);
    pulse(["esp32.GPIO8", "esp32.GPIO9", "esp32.GPIO10", "mic.SD", "mic.WS", "mic.SCK"], false);

    setFlow("cloud");
    await sleep(900);

    setFlow("amp");
    fishEl.classList.add("is-talking");
    pulse(["esp32.GPIO11", "esp32.GPIO12", "esp32.GPIO13", "amp.DIN", "amp.LRC", "amp.BCLK", "amp.SPO", "spk.POS"], true);
    await sleep(600);

    setFlow("motor");
    pulse(
      ["esp32.GPIO16", "esp32.GPIO17", "l298n.IN1", "l298n.IN2", "l298n.OUT1", "l298n.OUT2", "mouth.A", "mouth.B"],
      true
    );
    await sleep(1400);
    pulse(
      [
        "esp32.GPIO11",
        "esp32.GPIO12",
        "esp32.GPIO13",
        "amp.DIN",
        "amp.LRC",
        "amp.BCLK",
        "amp.SPO",
        "spk.POS",
        "esp32.GPIO16",
        "esp32.GPIO17",
        "l298n.IN1",
        "l298n.IN2",
        "l298n.OUT1",
        "l298n.OUT2",
        "mouth.A",
        "mouth.B",
      ],
      false
    );
    pulse(["esp32.GPIO4", "esp32.GPIO5", "l298n.IN3", "l298n.IN4", "tail.A", "tail.B"], true);
    await sleep(500);
    pulse(["esp32.GPIO4", "esp32.GPIO5", "l298n.IN3", "l298n.IN4", "tail.A", "tail.B"], false);

    fishEl.classList.remove("is-talking");
    setFlow("idle");
    setStatus("Simulation complete — wiring can support a talk turn", "connected");
    simRunning = false;
    btnSim.disabled = false;
  });

  redraw();

  return {
    loadReference() {
      root.querySelector('[data-act="load"]').click();
    },
  };
}
