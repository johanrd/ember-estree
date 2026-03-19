/**
 * Benchmark script using mitata.
 *
 * When run standalone (`node --expose-gc tests/parser.bench.mjs`), it benchmarks
 * the local parsers only. When `bench-compare.mjs` passes `--control-dir <dir>`,
 * it also loads the control (base-branch) parsers from that directory and wraps
 * each size in a `summary()` so mitata shows a side-by-side comparison with
 * boxplots.
 *
 * Usage:
 *   node --expose-gc tests/parser.bench.mjs [--control-dir <path>]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { run, bench, boxplot, summary, do_not_optimize } from "mitata";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const ctrlIdx = args.indexOf("--control-dir");
const CONTROL_DIR = ctrlIdx !== -1 ? resolve(args[ctrlIdx + 1]) : null;

// ---------------------------------------------------------------------------
// Load experiment (current branch) parser
// ---------------------------------------------------------------------------

const experiment = await import("../src/index.js");

// ---------------------------------------------------------------------------
// (Optionally) load control (base branch) parser from tmp dir
// ---------------------------------------------------------------------------

let control = null;

if (CONTROL_DIR) {
  control = await import(resolve(CONTROL_DIR, "src/index.js"));
}

// ---------------------------------------------------------------------------
// Fixture content
// ---------------------------------------------------------------------------

function fixture(name) {
  return readFileSync(fileURLToPath(new URL(`./bench/${name}`, import.meta.url)), "utf8");
}

const FIXTURES = {
  gts: { small: fixture("small.gts"), medium: fixture("medium.gts"), large: fixture("large.gts") },
  gjs: { small: fixture("small.gjs"), medium: fixture("medium.gjs"), large: fixture("large.gjs") },
  hbs: { small: fixture("small.hbs"), medium: fixture("medium.hbs"), large: fixture("large.hbs") },
};

// ---------------------------------------------------------------------------
// Register benchmarks
// ---------------------------------------------------------------------------

const PARSERS = [
  {
    type: "gts",
    ext: ".gts",
    experimentParse: (code, opts) => experiment.parse(code, opts),
    controlParse: control ? (code, opts) => control.parse(code, opts) : null,
  },
  {
    type: "gjs",
    ext: ".gjs",
    experimentParse: (code, opts) => experiment.parse(code, opts),
    controlParse: control ? (code, opts) => control.parse(code, opts) : null,
  },
  {
    type: "hbs",
    ext: ".hbs",
    experimentParse: (code, opts) => experiment.parse(code, { ...opts, templateOnly: true }),
    controlParse: control
      ? (code, opts) => control.parse(code, { ...opts, templateOnly: true })
      : null,
  },
];

const SIZES = ["small", "medium", "large"];

// ---------------------------------------------------------------------------
// JIT warm-up — parse every fixture with both parsers so V8 compiles and
// optimises the hot paths before any measurement begins.  Without this, the
// first-to-run parser pays the JIT compilation cost, creating order bias.
// ---------------------------------------------------------------------------

const WARMUP_ROUNDS = 20;

for (const { type, ext, experimentParse, controlParse } of PARSERS) {
  for (const size of SIZES) {
    const code = FIXTURES[type][size];
    const opts = { filePath: `${size}${ext}` };

    for (let i = 0; i < WARMUP_ROUNDS; i++) {
      do_not_optimize(experimentParse(code, opts));
      if (controlParse) do_not_optimize(controlParse(code, opts));
    }
  }
}

globalThis.gc?.();

// Alternate registration order: whichever parser runs first in a
// summary group gets a small advantage (warm instruction cache, more
// favourable thermal/frequency state).  By flipping the order on
// every other group the bias cancels out across the full run instead
// of always penalising the same side.
let groupIndex = 0;

for (const { type, ext, experimentParse, controlParse } of PARSERS) {
  for (const size of SIZES) {
    const code = FIXTURES[type][size];
    const opts = { filePath: `${size}${ext}` };

    // Force a full GC before each benchmark group to reduce GC-triggered variance
    globalThis.gc?.();

    if (controlParse) {
      // Use gc('once') (mitata's default) — runs GC once before the
      // measurement loop.  gc('inner') was forcing GC between every
      // iteration which doubled the time budget and capped us at ~12
      // samples for expensive benchmarks.  With gc('once') mitata
      // collects many more samples, and its built-in outlier trimming
      // (drop top/bottom 2) handles the occasional mid-measurement GC.
      const controlFirst = groupIndex % 2 === 0;
      groupIndex++;

      boxplot(() => {
        summary(() => {
          if (controlFirst) {
            bench(`${type} ${size} (control)`, () => do_not_optimize(controlParse(code, opts)));
            bench(`${type} ${size} (experiment)`, () =>
              do_not_optimize(experimentParse(code, opts)));
          } else {
            bench(`${type} ${size} (experiment)`, () =>
              do_not_optimize(experimentParse(code, opts)));
            bench(`${type} ${size} (control)`, () => do_not_optimize(controlParse(code, opts)));
          }
        });
      });
    } else {
      // Standalone mode — just benchmark the local parsers
      bench(`${type} ${size}`, () => do_not_optimize(experimentParse(code, opts)));
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const result = await run({ colors: false, throw: true });

// Write JSON output if requested
const jsonPath = process.env.BENCH_JSON_OUTPUT;
if (jsonPath) {
  const { writeFileSync } = await import("node:fs");

  const benchmarks = result.benchmarks.map((trial) => ({
    alias: trial.alias,
    runs: trial.runs.map((r) => ({
      name: r.name,
      args: r.args,
      error: r.error ? { message: r.error.message || String(r.error) } : undefined,
      stats: r.stats
        ? {
            avg: r.stats.avg,
            min: r.stats.min,
            max: r.stats.max,
            p50: r.stats.p50,
            p75: r.stats.p75,
            p99: r.stats.p99,
            samples: r.stats.samples,
          }
        : undefined,
    })),
  }));

  writeFileSync(jsonPath, JSON.stringify({ context: result.context, benchmarks }, null, 2));
}
