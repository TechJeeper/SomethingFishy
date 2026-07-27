/**
 * Wiring Lab simulator — build connections, validate against netlist, run signal-flow sim.
 */
import {
  MODULES,
  referenceWires,
  validateWiring,
} from "./netlist.js";

/**
 * @param {HTMLElement} root
 */
export function mountWiringLab(root) {
  /** @type {{a:string,b:string,id:string}[]} */
  let wires = [];
  let selected = null;
  let simRunning = false;

  root.innerHTML = `
    <div class="lab-toolbar">
      <button type="button" class="btn btn-secondary" data-act="load">Load reference design</button>
      <button type="button" class="btn btn-secondary" data-act="clear">Clear wires</button>
      <button type="button" class="btn btn-primary" data-act="validate">Validate wiring</button>
      <button type="button" class="btn btn-primary" data-act="simulate" disabled>Simulate talk turn</button>
      <span class="status-pill" data-status>No wires yet</span>
    </div>
    <p class="lab-hint">Click a pin, then another pin, to add a wire. Or load the reference design and validate.</p>
    <div class="lab-grid">
      <div class="lab-board" data-board></div>
      <aside class="lab-side">
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
    <svg class="lab-wires" data-wires-svg></svg>
  `;

  const board = root.querySelector("[data-board]");
  const resultsEl = root.querySelector("[data-results]");
  const statusEl = root.querySelector("[data-status]");
  const flowEl = root.querySelector("[data-flow]");
  const fishEl = root.querySelector("[data-fish]");
  const svg = root.querySelector("[data-wires-svg]");
  const btnSim = root.querySelector('[data-act="simulate"]');

  // Render modules
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

  function pinCenter(ep) {
    const btn = root.querySelector(`.lab-pin[data-ep="${ep}"]`);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const host = root.getBoundingClientRect();
    return { x: r.left + r.width / 2 - host.left, y: r.top + r.height / 2 - host.top };
  }

  function redrawWires() {
    const host = root.getBoundingClientRect();
    svg.setAttribute("width", String(host.width));
    svg.setAttribute("height", String(host.height));
    svg.innerHTML = "";
    for (const w of wires) {
      const pa = pinCenter(w.a);
      const pb = pinCenter(w.b);
      if (!pa || !pb) continue;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const mx = (pa.x + pb.x) / 2;
      path.setAttribute("d", `M${pa.x} ${pa.y} C${mx} ${pa.y}, ${mx} ${pb.y}, ${pb.x} ${pb.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", w.color || "#3dbeb0");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-opacity", "0.9");
      path.dataset.wire = w.id;
      svg.appendChild(path);
    }
    // selection highlight
    root.querySelectorAll(".lab-pin").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.ep === selected);
      const used = wires.some((w) => w.a === el.dataset.ep || w.b === el.dataset.ep);
      el.classList.toggle("is-wired", used);
    });
  }

  function addWire(a, b) {
    if (a === b) return;
    const id = [a, b].sort().join("|");
    if (wires.some((w) => w.id === id)) return;
    wires.push({ a, b, id, color: "#3dbeb0" });
    setStatus(`${wires.length} wire(s)`, "connected");
    btnSim.disabled = true;
    redrawWires();
  }

  board.addEventListener("click", (e) => {
    const btn = e.target.closest(".lab-pin");
    if (!btn) return;
    const ep = btn.dataset.ep;
    if (!selected) {
      selected = ep;
      redrawWires();
      return;
    }
    addWire(selected, ep);
    selected = null;
    redrawWires();
  });

  root.querySelector('[data-act="load"]').addEventListener("click", () => {
    wires = referenceWires().map((w) => ({
      a: w.a,
      b: w.b,
      id: [w.a, w.b].sort().join("|"),
      color: w.color,
      name: w.name,
    }));
    selected = null;
    setStatus(`Reference design loaded (${wires.length} wires)`, "connected");
    btnSim.disabled = true;
    resultsEl.innerHTML = `<p class="field-hint">Reference design loaded. Click <strong>Validate wiring</strong> to confirm it matches firmware pins.</p>`;
    redrawWires();
  });

  root.querySelector('[data-act="clear"]').addEventListener("click", () => {
    wires = [];
    selected = null;
    btnSim.disabled = true;
    setStatus("No wires yet");
    resultsEl.innerHTML = `<p class="field-hint">Cleared. Load reference or click pins to wire.</p>`;
    setFlow(null);
    fishEl.classList.remove("is-talking");
    redrawWires();
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
      li.textContent = `${r.ok ? "✓" : "✗"} ${r.label}`;
      ul.appendChild(li);
    }
    resultsEl.appendChild(ul);
    setStatus(report.pass ? "Validated — ready to simulate" : "Validation failed", report.pass ? "connected" : "error");
    btnSim.disabled = !report.pass;
  });

  function setFlow(step) {
    flowEl.querySelectorAll("[data-step]").forEach((li) => {
      li.classList.toggle("is-active", li.dataset.step === step);
      li.classList.toggle("is-done", false);
    });
    if (!step) return;
    const order = ["idle", "btn", "mic", "cloud", "amp", "motor"];
    const idx = order.indexOf(step);
    order.forEach((s, i) => {
      const li = flowEl.querySelector(`[data-step="${s}"]`);
      if (!li) return;
      if (i < idx) li.classList.add("is-done");
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

    const pulse = (eps, on) => {
      eps.forEach((ep) => {
        root.querySelector(`.lab-pin[data-ep="${ep}"]`)?.classList.toggle("is-live", on);
      });
      // highlight matching wires
      svg.querySelectorAll("path").forEach((p) => {
        const w = wires.find((x) => x.id === p.dataset.wire);
        if (!w) return;
        const hit = eps.includes(w.a) || eps.includes(w.b);
        p.classList.toggle("is-live", on && hit);
      });
    };

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
    // tail twitch
    pulse(["esp32.GPIO4", "esp32.GPIO5", "l298n.IN3", "l298n.IN4", "tail.A", "tail.B"], true);
    await sleep(500);
    pulse(["esp32.GPIO4", "esp32.GPIO5", "l298n.IN3", "l298n.IN4", "tail.A", "tail.B"], false);

    fishEl.classList.remove("is-talking");
    setFlow("idle");
    setStatus("Simulation complete — wiring can support a talk turn", "connected");
    simRunning = false;
    btnSim.disabled = false;
  });

  window.addEventListener("resize", () => redrawWires());
  // initial
  requestAnimationFrame(() => redrawWires());

  return {
    loadReference() {
      root.querySelector('[data-act="load"]').click();
    },
  };
}
