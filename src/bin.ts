#!/usr/bin/env node

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import { validateBenchmark } from "./benchmark.js";
import { buildGraph } from "./graph.js";
import { generateMermaid } from "./mermaid.js";
import {
  formatValidationIssues,
  loadArchitecture,
} from "./validation.js";

function usage(): never {
  console.error(`Usage:
  archloop validate <architecture.yaml>
  archloop validate-dir <directory>
  archloop graph <architecture.yaml>
  archloop mermaid <architecture.yaml> [output.mmd]
  archloop benchmark <ground-truth.yaml>`);
  process.exit(2);
}

async function validateFile(filePath: string): Promise<boolean> {
  const result = await loadArchitecture(filePath);
  if (!result.valid || !result.value) {
    console.error(`INVALID ${filePath}`);
    console.error(formatValidationIssues(result.issues));
    return false;
  }

  const graph = buildGraph(result.value);
  console.log(
    `VALID ${filePath} (${graph.nodes.size} components, ${graph.edges.length} relationships)`,
  );
  return true;
}

async function main(): Promise<void> {
  const [, , command, input, output] = process.argv;
  if (!command || !input) usage();

  if (command === "validate") {
    process.exitCode = (await validateFile(resolve(input))) ? 0 : 1;
    return;
  }

  if (command === "validate-dir") {
    const directory = resolve(input);
    const files = (await readdir(directory))
      .filter((file) => [".yaml", ".yml"].includes(extname(file)))
      .sort();
    let valid = true;
    for (const file of files) {
      const expectedInvalid = file.startsWith("invalid-");
      const filePath = join(directory, file);
      if (expectedInvalid) {
        const result = await loadArchitecture(filePath);
        if (result.valid) {
          console.error(`UNEXPECTED VALID ${filePath}`);
          valid = false;
        } else {
          console.log(`EXPECTED INVALID ${filePath} (${result.issues.length} issues)`);
        }
      } else if (!(await validateFile(filePath))) {
        valid = false;
      }
    }
    process.exitCode = valid ? 0 : 1;
    return;
  }

  if (command === "graph" || command === "mermaid") {
    const filePath = resolve(input);
    const result = await loadArchitecture(filePath);
    if (!result.valid || !result.value) {
      console.error(formatValidationIssues(result.issues));
      process.exitCode = 1;
      return;
    }

    if (command === "graph") {
      const graph = buildGraph(result.value);
      console.log(JSON.stringify({
        nodes: [...graph.nodes.keys()],
        edges: graph.edges.map(({ key, from, to, type }) => ({ key, from, to, type })),
      }, null, 2));
      return;
    }

    const mermaid = generateMermaid(result.value);
    if (output) {
      const outputPath = resolve(output);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, mermaid, "utf8");
      console.log(`WROTE ${outputPath}`);
    } else {
      console.log(mermaid);
    }
    return;
  }

  if (command === "benchmark") {
    const result = await validateBenchmark(input);
    if (!result.valid) {
      console.error("INVALID BENCHMARK");
      console.error(result.issues.map((issue) => `- ${issue}`).join("\n"));
      process.exitCode = 1;
      return;
    }
    console.log(
      `VALID BENCHMARK (${result.summary["no-impact"]} no-impact, ${result.summary.violation} violation, ${result.summary.evolution} evolution)`,
    );
    return;
  }

  usage();
}

await main();
