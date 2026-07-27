/**
 * SomethingFishy reference netlist — matches firmware/include/pins.h
 * Used by the interactive diagram and the wiring lab simulator.
 */
export const FIRMWARE_PINS = {
  mic_sd: 8,
  mic_ws: 9,
  mic_sck: 10,
  spk_dout: 11,
  spk_ws: 12,
  spk_bclk: 13,
  talk_btn: 14,
  motor_in1: 16,
  motor_in2: 17,
  motor_in3: 4,
  motor_in4: 5,
};

/** @typedef {{ id: string, label: string, side?: 'left'|'right', power?: boolean, gnd?: boolean }} PinDef */
/** @typedef {{ id: string, name: string, subtitle?: string, color: string, pins: PinDef[] }} ModuleDef */
/** @typedef {{ id: string, name: string, group: string, color: string, endpoints: [string, string] }} NetDef */

/** @type {ModuleDef[]} */
export const MODULES = [
  {
    id: "esp32",
    name: "ESP32-S3",
    subtitle: "DevKit · firmware brain",
    color: "#e8dcc8",
    pins: [
      { id: "3V3", label: "3V3", side: "left", power: true },
      { id: "5V", label: "5V", side: "left", power: true },
      { id: "GND", label: "GND", side: "left", gnd: true },
      { id: "GPIO8", label: "GPIO8", side: "right" },
      { id: "GPIO9", label: "GPIO9", side: "right" },
      { id: "GPIO10", label: "GPIO10", side: "right" },
      { id: "GPIO11", label: "GPIO11", side: "right" },
      { id: "GPIO12", label: "GPIO12", side: "right" },
      { id: "GPIO13", label: "GPIO13", side: "right" },
      { id: "GPIO14", label: "GPIO14", side: "right" },
      { id: "GPIO16", label: "GPIO16", side: "right" },
      { id: "GPIO17", label: "GPIO17", side: "right" },
      { id: "GPIO4", label: "GPIO4", side: "right" },
      { id: "GPIO5", label: "GPIO5", side: "right" },
    ],
  },
  {
    id: "mic",
    name: "INMP441",
    subtitle: "I2S MEMS microphone",
    color: "#3dbeb0",
    pins: [
      { id: "VDD", label: "VDD", side: "left", power: true },
      { id: "GND", label: "GND", side: "left", gnd: true },
      { id: "L_R", label: "L/R", side: "left" },
      { id: "WS", label: "WS", side: "right" },
      { id: "SCK", label: "SCK", side: "right" },
      { id: "SD", label: "SD", side: "right" },
    ],
  },
  {
    id: "amp",
    name: "MAX98357A",
    subtitle: "I2S class-D amp",
    color: "#3dbeb0",
    pins: [
      { id: "VIN", label: "VIN", side: "left", power: true },
      { id: "GND", label: "GND", side: "left", gnd: true },
      { id: "SD_MODE", label: "SD", side: "left" },
      { id: "DIN", label: "DIN", side: "right" },
      { id: "BCLK", label: "BCLK", side: "right" },
      { id: "LRC", label: "LRC", side: "right" },
      { id: "SPO", label: "+", side: "right" },
      { id: "SPO_N", label: "-", side: "right" },
    ],
  },
  {
    id: "l298n",
    name: "L298N",
    subtitle: "Dual H-bridge",
    color: "#e76f51",
    pins: [
      { id: "5V", label: "5V logic", side: "left", power: true },
      { id: "GND", label: "GND", side: "left", gnd: true },
      { id: "VIN", label: "Vin motors", side: "left", power: true },
      { id: "ENA", label: "ENA", side: "left" },
      { id: "ENB", label: "ENB", side: "left" },
      { id: "IN1", label: "IN1", side: "right" },
      { id: "IN2", label: "IN2", side: "right" },
      { id: "IN3", label: "IN3", side: "right" },
      { id: "IN4", label: "IN4", side: "right" },
      { id: "OUT1", label: "OUT1", side: "right" },
      { id: "OUT2", label: "OUT2", side: "right" },
      { id: "OUT3", label: "OUT3", side: "right" },
      { id: "OUT4", label: "OUT4", side: "right" },
    ],
  },
  {
    id: "spk",
    name: "Speaker",
    subtitle: "Stock Billy speaker",
    color: "#f08468",
    pins: [
      { id: "POS", label: "+", side: "left" },
      { id: "NEG", label: "-", side: "left" },
    ],
  },
  {
    id: "mouth",
    name: "Mouth motor",
    subtitle: "Bypass lead pair M",
    color: "#e76f51",
    pins: [
      { id: "A", label: "Lead A", side: "left" },
      { id: "B", label: "Lead B", side: "left" },
    ],
  },
  {
    id: "tail",
    name: "Tail motor",
    subtitle: "Bypass lead pair T",
    color: "#e76f51",
    pins: [
      { id: "A", label: "Lead A", side: "left" },
      { id: "B", label: "Lead B", side: "left" },
    ],
  },
  {
    id: "btn",
    name: "Talk button",
    subtitle: "Momentary · active low",
    color: "#a8e6df",
    pins: [
      { id: "SIG", label: "Signal", side: "left" },
      { id: "GND", label: "GND", side: "left", gnd: true },
    ],
  },
];

/** Reference design nets (endpoint = "moduleId.pinId") */
/** @type {NetDef[]} */
export const REFERENCE_NETS = [
  { id: "gnd", name: "Common GND", group: "power", color: "#888888", endpoints: ["esp32.GND", "mic.GND"] },
  { id: "gnd2", name: "Common GND", group: "power", color: "#888888", endpoints: ["esp32.GND", "amp.GND"] },
  { id: "gnd3", name: "Common GND", group: "power", color: "#888888", endpoints: ["esp32.GND", "l298n.GND"] },
  { id: "gnd4", name: "Common GND", group: "power", color: "#888888", endpoints: ["esp32.GND", "btn.GND"] },
  { id: "mic_vdd", name: "Mic 3V3", group: "power", color: "#e8dcc8", endpoints: ["esp32.3V3", "mic.VDD"] },
  { id: "mic_lr", name: "Mic L/R → GND (left ch)", group: "mic", color: "#888888", endpoints: ["mic.L_R", "mic.GND"] },
  { id: "mic_sd", name: "I2S Mic SD", group: "mic", color: "#3dbeb0", endpoints: ["esp32.GPIO8", "mic.SD"] },
  { id: "mic_ws", name: "I2S Mic WS", group: "mic", color: "#3dbeb0", endpoints: ["esp32.GPIO9", "mic.WS"] },
  { id: "mic_sck", name: "I2S Mic BCLK", group: "mic", color: "#3dbeb0", endpoints: ["esp32.GPIO10", "mic.SCK"] },
  { id: "amp_vin", name: "Amp 5V", group: "power", color: "#e8dcc8", endpoints: ["esp32.5V", "amp.VIN"] },
  { id: "amp_sd", name: "Amp SD enable", group: "amp", color: "#e8dcc8", endpoints: ["esp32.3V3", "amp.SD_MODE"] },
  { id: "amp_din", name: "I2S Amp DIN", group: "amp", color: "#3dbeb0", endpoints: ["esp32.GPIO11", "amp.DIN"] },
  { id: "amp_lrc", name: "I2S Amp LRC", group: "amp", color: "#3dbeb0", endpoints: ["esp32.GPIO12", "amp.LRC"] },
  { id: "amp_bclk", name: "I2S Amp BCLK", group: "amp", color: "#3dbeb0", endpoints: ["esp32.GPIO13", "amp.BCLK"] },
  { id: "spk_p", name: "Speaker +", group: "amp", color: "#f08468", endpoints: ["amp.SPO", "spk.POS"] },
  { id: "spk_n", name: "Speaker -", group: "amp", color: "#f08468", endpoints: ["amp.SPO_N", "spk.NEG"] },
  { id: "m_in1", name: "Mouth IN1", group: "motor", color: "#e76f51", endpoints: ["esp32.GPIO16", "l298n.IN1"] },
  { id: "m_in2", name: "Mouth IN2", group: "motor", color: "#e76f51", endpoints: ["esp32.GPIO17", "l298n.IN2"] },
  { id: "t_in3", name: "Tail IN3", group: "motor", color: "#e76f51", endpoints: ["esp32.GPIO4", "l298n.IN3"] },
  { id: "t_in4", name: "Tail IN4", group: "motor", color: "#e76f51", endpoints: ["esp32.GPIO5", "l298n.IN4"] },
  { id: "m_out1", name: "Mouth motor A", group: "motor", color: "#e76f51", endpoints: ["l298n.OUT1", "mouth.A"] },
  { id: "m_out2", name: "Mouth motor B", group: "motor", color: "#e76f51", endpoints: ["l298n.OUT2", "mouth.B"] },
  { id: "t_out3", name: "Tail motor A", group: "motor", color: "#f08468", endpoints: ["l298n.OUT3", "tail.A"] },
  { id: "t_out4", name: "Tail motor B", group: "motor", color: "#f08468", endpoints: ["l298n.OUT4", "tail.B"] },
  { id: "ena", name: "ENA jumper on (→5V)", group: "motor", color: "#e8dcc8", endpoints: ["l298n.ENA", "l298n.5V"] },
  { id: "enb", name: "ENB jumper on (→5V)", group: "motor", color: "#e8dcc8", endpoints: ["l298n.ENB", "l298n.5V"] },
  { id: "logic5", name: "L298N logic 5V", group: "power", color: "#e8dcc8", endpoints: ["esp32.5V", "l298n.5V"] },
  { id: "btn", name: "Talk button", group: "ui", color: "#a8e6df", endpoints: ["esp32.GPIO14", "btn.SIG"] },
];

/** Required undirected pairs for a passing build (normalized "a|b" sorted). */
export function netKey(a, b) {
  return [a, b].sort().join("|");
}

export function referencePairSet(nets = REFERENCE_NETS) {
  const set = new Set();
  for (const n of nets) set.add(netKey(n.endpoints[0], n.endpoints[1]));
  return set;
}

/**
 * Validate a user wiring (array of {a,b} endpoint pairs) against electrical rules.
 * @param {{a:string,b:string}[]} wires
 */
export function validateWiring(wires) {
  const pairs = new Set(wires.map((w) => netKey(w.a, w.b)));
  const results = [];

  const need = [
    ["esp32.GND", "mic.GND", "Mic shares GND with ESP32"],
    ["esp32.GND", "amp.GND", "Amp shares GND with ESP32"],
    ["esp32.GND", "l298n.GND", "L298N shares GND with ESP32"],
    ["esp32.3V3", "mic.VDD", "Mic VDD on 3V3 only"],
    ["mic.L_R", "mic.GND", "Mic L/R tied to GND (left channel)"],
    ["esp32.GPIO8", "mic.SD", "Mic SD → GPIO8"],
    ["esp32.GPIO9", "mic.WS", "Mic WS → GPIO9"],
    ["esp32.GPIO10", "mic.SCK", "Mic SCK → GPIO10"],
    ["esp32.5V", "amp.VIN", "Amp powered from 5V"],
    ["esp32.GPIO11", "amp.DIN", "Amp DIN → GPIO11"],
    ["esp32.GPIO12", "amp.LRC", "Amp LRC → GPIO12"],
    ["esp32.GPIO13", "amp.BCLK", "Amp BCLK → GPIO13"],
    ["amp.SPO", "spk.POS", "Speaker + from amp"],
    ["amp.SPO_N", "spk.NEG", "Speaker − from amp"],
    ["esp32.GPIO16", "l298n.IN1", "Mouth IN1 → GPIO16"],
    ["esp32.GPIO17", "l298n.IN2", "Mouth IN2 → GPIO17"],
    ["esp32.GPIO4", "l298n.IN3", "Tail IN3 → GPIO4"],
    ["esp32.GPIO5", "l298n.IN4", "Tail IN4 → GPIO5"],
    ["l298n.OUT1", "mouth.A", "Mouth motor on OUT1"],
    ["l298n.OUT2", "mouth.B", "Mouth motor on OUT2"],
    ["l298n.OUT3", "tail.A", "Tail motor on OUT3"],
    ["l298n.OUT4", "tail.B", "Tail motor on OUT4"],
    ["l298n.ENA", "l298n.5V", "ENA jumper enabling channel A"],
    ["l298n.ENB", "l298n.5V", "ENB jumper enabling channel B"],
    ["esp32.GPIO14", "btn.SIG", "Talk button on GPIO14"],
  ];

  for (const [a, b, label] of need) {
    const ok = pairs.has(netKey(a, b));
    results.push({ id: netKey(a, b), label, ok, severity: "required" });
  }

  // Hard fails / danger
  const danger = [
    ["mic.VDD", "esp32.5V", "Mic VDD must NOT connect to 5V (will damage INMP441)"],
    ["spk.POS", "esp32.GPIO11", "Speaker must not hang on a GPIO - use the amp"],
    ["mouth.A", "esp32.GPIO16", "Motor must not connect directly to GPIO - use L298N"],
  ];
  for (const [a, b, label] of danger) {
    const bad = pairs.has(netKey(a, b));
    results.push({ id: "danger:" + netKey(a, b), label, ok: !bad, severity: "danger" });
  }

  // GPIO uniqueness on signal nets (ignore power/gnd fanout)
  const gpioOwner = new Map();
  for (const w of wires) {
    for (const ep of [w.a, w.b]) {
      if (!ep.startsWith("esp32.GPIO")) continue;
      const other = ep === w.a ? w.b : w.a;
      if (other.includes("GND") || other.endsWith(".5V") || other.endsWith(".3V3")) continue;
      if (!gpioOwner.has(ep)) gpioOwner.set(ep, other);
      else if (gpioOwner.get(ep) !== other) {
        results.push({
          id: "dup:" + ep,
          label: `${ep} is wired to multiple signals (${gpioOwner.get(ep)} and ${other})`,
          ok: false,
          severity: "danger",
        });
      }
    }
  }

  const required = results.filter((r) => r.severity === "required");
  const dangers = results.filter((r) => r.severity === "danger");
  const passRequired = required.every((r) => r.ok);
  const passDanger = dangers.every((r) => r.ok);
  return {
    results,
    pass: passRequired && passDanger,
    score: required.filter((r) => r.ok).length,
    total: required.length,
  };
}

export function referenceWires() {
  return REFERENCE_NETS.map((n) => ({ a: n.endpoints[0], b: n.endpoints[1], netId: n.id, name: n.name, group: n.group, color: n.color }));
}

export function getModule(id) {
  return MODULES.find((m) => m.id === id);
}

export function parseEndpoint(ep) {
  const [moduleId, pinId] = ep.split(".");
  return { moduleId, pinId, ep };
}
