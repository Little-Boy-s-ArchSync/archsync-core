#!/usr/bin/env node

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import { validateBenchmark } from "./benchmark.js";
import {
  analyzeConformance,
  formatConformanceResult,
  type ConformanceResult,
} from "./conformance.js";
import {
  generateConformanceDrawio,
  generateConformanceMermaid,
} from "./conformance-report.js";
import { generateDrawio } from "./drawio.js";
import { buildGraph, diffGraphs } from "./graph.js";
import { generateMermaid } from "./mermaid.js";
import {
  formatValidationIssues,
  loadArchitecture,
} from "./validation.js";
import type { ValidationIssue } from "./model.js";

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function formatInvalidArchitecture(
  filePath: string,
  issues: ValidationIssue[],
  role?: "EXPECTED" | "OBSERVED",
): string {
  return [
    "RESULT: INVALID",
    ...(role ? [`MODEL: ${role}`] : []),
    `FILE: ${filePath}`,
    "",
    formatValidationIssues(issues),
    "",
    "NEXT STEP: Fix the listed problems, then run validation again.",
    "EXIT CODE: 1 (INVALID)",
  ].join("\n");
}

function formatRuntimeError(error: unknown): string {
  const details = error instanceof Error
    ? error.message
    : String(error);
  const code = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
  const path = error && typeof error === "object" && "path" in error
    ? String(error.path)
    : undefined;
  const reason = code === "ENOENT" && path
    ? `Input path does not exist: ${path}`
    : details;
  return [
    "RESULT: ERROR",
    `REASON: ${reason}`,
    "",
    "NEXT STEP: Check the input and output paths, permissions and file contents, then run the command again.",
    "EXIT CODE: 2 (INPUT/IO)",
  ].join("\n");
}

function usage(): never {
  console.error(`Usage:
  archsync validate <architecture.yaml>
  archsync validate-dir <directory> [--expect-invalid-prefix]
  archsync graph <architecture.yaml>
  archsync diff <expected.yaml> <observed.yaml>
  archsync check <expected.yaml> <observed.yaml>
  archsync check-json <expected.yaml> <observed.yaml>
  archsync report <expected.yaml> <observed.yaml> <output.mmd|output.drawio>
  archsync mermaid <architecture.yaml> [output.mmd]
  archsync drawio <architecture.yaml> [output.drawio]
  archsync benchmark <ground-truth.json>`);
  process.exit(2);
}

async function validateFile(filePath: string): Promise<boolean> {
  const result = await loadArchitecture(filePath);
  if (!result.valid || !result.value) {
    console.error(formatInvalidArchitecture(filePath, result.issues));
    return false;
  }

  const graph = buildGraph(result.value);
  console.log([
    "RESULT: VALID",
    `FILE: ${filePath}`,
    `SUMMARY: ${counted(graph.nodes.size, "component")}, ${counted(graph.edges.length, "relationship")}`,
  ].join("\n"));
  return true;
}

function serializeConformance(result: ConformanceResult): object {
  return {
    classification: result.classification,
    summary: result.summary,
    findings: result.findings,
    diff: {
      addedNodes: result.diff.addedNodes.map(({ id }) => id),
      removedNodes: result.diff.removedNodes.map(({ id }) => id),
      changedNodes: result.diff.changedNodes.map(({ id, expected, observed }) => ({
        id,
        expected: expected.component,
        observed: observed.component,
      })),
      addedEdges: result.diff.addedEdges.map(({ key }) => key),
      removedEdges: result.diff.removedEdges.map(({ key }) => key),
    },
  };
}

async function main(): Promise<void> {
  const [, , command, input, output, reportOutput] = process.argv;
  if (!command || !input) usage();

  if (command === "validate") {
    process.exitCode = (await validateFile(resolve(input))) ? 0 : 1;
    return;
  }

  if (command === "validate-dir") {
    const expectInvalidPrefix = output === "--expect-invalid-prefix";
    if (output && !expectInvalidPrefix) usage();
    const directory = resolve(input);
    const files = (await readdir(directory))
      .filter((file) => [".yaml", ".yml"].includes(extname(file)))
      .sort();
    if (files.length === 0) {
      console.error(formatRuntimeError(
        new Error(`No architecture YAML files were found in ${directory}`),
      ));
      process.exitCode = 2;
      return;
    }
    let valid = true;
    for (const file of files) {
      const expectedInvalid = expectInvalidPrefix && file.startsWith("invalid-");
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

  if (command === "diff" || command === "check" || command === "check-json" || command === "report") {
    if (!output) usage();
    const expectedPath = resolve(input);
    const observedPath = resolve(output);
    const [expected, observed] = await Promise.all([
      loadArchitecture(expectedPath),
      loadArchitecture(observedPath),
    ]);

    if (!expected.valid || !expected.value) {
      console.error(formatInvalidArchitecture(expectedPath, expected.issues, "EXPECTED"));
      process.exitCode = 1;
      return;
    }
    if (!observed.valid || !observed.value) {
      console.error(formatInvalidArchitecture(observedPath, observed.issues, "OBSERVED"));
      process.exitCode = 1;
      return;
    }

    if (command === "diff") {
      const diff = diffGraphs(buildGraph(expected.value), buildGraph(observed.value));
      console.log(JSON.stringify({
        addedNodes: diff.addedNodes.map(({ id }) => id),
        removedNodes: diff.removedNodes.map(({ id }) => id),
        changedNodes: diff.changedNodes.map(({ id, expected: before, observed: after }) => ({
          id,
          expected: before.component,
          observed: after.component,
        })),
        addedEdges: diff.addedEdges.map(({ key, from, to, type }) => ({ key, from, to, type })),
        removedEdges: diff.removedEdges.map(({ key, from, to, type }) => ({ key, from, to, type })),
      }, null, 2));
      return;
    }

    const result = analyzeConformance(expected.value, observed.value);
    if (command === "report") {
      if (!reportOutput) usage();
      const outputPath = resolve(reportOutput);
      const extension = extname(outputPath).toLowerCase();
      const rendered = extension === ".mmd"
        ? generateConformanceMermaid(expected.value, observed.value, result)
        : extension === ".drawio"
          ? generateConformanceDrawio(expected.value, observed.value, result)
          : undefined;
      if (!rendered) {
        console.error("Report output must end with .mmd or .drawio");
        process.exitCode = 2;
        return;
      }
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, rendered, "utf8");
      console.log(`WROTE ${outputPath} (${result.classification.toUpperCase()})`);
      return;
    }

    if (command === "check-json") {
      console.log(JSON.stringify(serializeConformance(result), null, 2));
    } else {
      console.log(formatConformanceResult(result));
    }
    process.exitCode = result.classification === "no-impact"
      ? 0
      : result.classification === "violation"
        ? 1
        : 3;
    return;
  }

  if (command === "graph" || command === "mermaid" || command === "drawio") {
    const filePath = resolve(input);
    const result = await loadArchitecture(filePath);
    if (!result.valid || !result.value) {
      console.error(formatInvalidArchitecture(filePath, result.issues));
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

    const rendered = command === "drawio"
      ? generateDrawio(result.value)
      : generateMermaid(result.value);
    if (output) {
      const outputPath = resolve(output);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, rendered, "utf8");
      console.log(`WROTE ${outputPath}`);
    } else {
      console.log(rendered);
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
      `VALID BENCHMARK (${result.evaluatedCases}/${result.totalCases} engine-evaluated: ${result.summary["no-impact"]} no-impact, ${result.summary.violation} violation, ${result.summary.evolution} evolution)`,
    );
    return;
  }

  usage();
}

try {
  await main();
} catch (error) {
  console.error(formatRuntimeError(error));
  process.exitCode = 2;
}
