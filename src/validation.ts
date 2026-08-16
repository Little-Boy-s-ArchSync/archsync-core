import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import { parseDocument } from "yaml";

import type {
  ArchitectureDocument,
  ValidationIssue,
  ValidationResult,
} from "./model.js";

const schemaUrl = new URL("../specs/architecture.schema.json", import.meta.url);
let validatorPromise: Promise<ValidateFunction<ArchitectureDocument>> | undefined;

export function formatSchemaIssue(error: ErrorObject): ValidationIssue {
  const property = "missingProperty" in error.params
    ? String(error.params.missingProperty)
    : "additionalProperty" in error.params
      ? String(error.params.additionalProperty)
      : error.propertyName ?? (
          "propertyName" in error.params
            ? String(error.params.propertyName)
            : undefined
        );
  const suffix = property === undefined
    ? ""
    : `/${property.replaceAll("~", "~0").replaceAll("/", "~1")}`;

  return {
    path: `${error.instancePath}${suffix}` || "/",
    message: error.message ?? "Schema validation failed",
    keyword: "schema",
  };
}

async function getValidator(): Promise<ValidateFunction<ArchitectureDocument>> {
  validatorPromise ??= (async () => {
    const schema = JSON.parse(await readFile(fileURLToPath(schemaUrl), "utf8")) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    return ajv.compile<ArchitectureDocument>(schema);
  })();

  return validatorPromise;
}

function isExactSelector(selector: string): boolean {
  return !selector.includes("*");
}

function findDuplicateIds(items: Array<{ id: string }>, path: string): ValidationIssue[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.add(item.id);
    }
    seen.add(item.id);
  }

  return [...duplicates].map((id) => ({
    path,
    message: `Duplicate id '${id}'`,
    keyword: "duplicate" as const,
  }));
}

export function validateArchitectureSemantics(
  value: ArchitectureDocument,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const componentIds = new Set(Object.keys(value.components));
  const edgeKeys = new Set<string>();

  value.relationships.forEach((relationship, index) => {
    if (!componentIds.has(relationship.from)) {
      issues.push({
        path: `/relationships/${index}/from`,
        message: `Unknown component '${relationship.from}'`,
        keyword: "reference",
      });
    }
    if (!componentIds.has(relationship.to)) {
      issues.push({
        path: `/relationships/${index}/to`,
        message: `Unknown component '${relationship.to}'`,
        keyword: "reference",
      });
    }
    if (relationship.from === relationship.to) {
      issues.push({
        path: `/relationships/${index}`,
        message: "Self relationships are not supported in schema v0.1",
        keyword: "semantic",
      });
    }

    const key = `${relationship.from}|${relationship.type}|${relationship.to}`;
    if (edgeKeys.has(key)) {
      issues.push({
        path: `/relationships/${index}`,
        message: `Duplicate relationship '${key}'`,
        keyword: "duplicate",
      });
    }
    edgeKeys.add(key);
  });

  issues.push(
    ...findDuplicateIds(
      value.relationships.filter(
        (relationship): relationship is typeof relationship & { id: string } =>
          relationship.id !== undefined,
      ),
      "/relationships",
    ),
    ...findDuplicateIds(value.rules ?? [], "/rules"),
    ...findDuplicateIds(value.quality_goals ?? [], "/quality_goals"),
  );

  (value.rules ?? []).forEach((rule, index) => {
    if (isExactSelector(rule.from) && !componentIds.has(rule.from)) {
      issues.push({
        path: `/rules/${index}/from`,
        message: `Unknown component selector '${rule.from}'`,
        keyword: "reference",
      });
    }
    if (isExactSelector(rule.to) && !componentIds.has(rule.to)) {
      issues.push({
        path: `/rules/${index}/to`,
        message: `Unknown component selector '${rule.to}'`,
        keyword: "reference",
      });
    }
  });

  (value.quality_goals ?? []).forEach((goal, index) => {
    if (goal.scope && isExactSelector(goal.scope) && !componentIds.has(goal.scope)) {
      issues.push({
        path: `/quality_goals/${index}/scope`,
        message: `Unknown component selector '${goal.scope}'`,
        keyword: "reference",
      });
    }
    if (["<", "<=", ">=", ">"].includes(goal.operator) && typeof goal.target !== "number") {
      issues.push({
        path: `/quality_goals/${index}/target`,
        message: `Operator '${goal.operator}' requires a numeric target`,
        keyword: "semantic",
      });
    }
    if (
      ["contains", "not_contains"].includes(goal.operator) &&
      typeof goal.target !== "string"
    ) {
      issues.push({
        path: `/quality_goals/${index}/target`,
        message: `Operator '${goal.operator}' requires a string target`,
        keyword: "semantic",
      });
    }
  });

  return issues;
}

export async function parseArchitecture(
  source: string,
): Promise<ValidationResult<ArchitectureDocument>> {
  const yaml = parseDocument(source, { prettyErrors: true, uniqueKeys: true });
  const yamlIssues = [...yaml.errors, ...yaml.warnings];

  if (yamlIssues.length > 0) {
    return {
      valid: false,
      issues: yamlIssues.map((error) => ({
        path: "/",
        message: error.message,
        keyword: "schema",
      })),
    };
  }

  const value = yaml.toJS() as unknown;
  const validate = await getValidator();

  if (!validate(value)) {
    return {
      valid: false,
      issues: validate.errors!.map(formatSchemaIssue),
    };
  }

  const semanticIssues = validateArchitectureSemantics(value);
  return {
    valid: semanticIssues.length === 0,
    value,
    issues: semanticIssues,
  };
}

export async function loadArchitecture(
  filePath: string,
): Promise<ValidationResult<ArchitectureDocument>> {
  return parseArchitecture(await readFile(filePath, "utf8"));
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  const lines = [`PROBLEMS (${issues.length})`];
  issues.forEach((issue, index) => {
    lines.push(
      `${index + 1}. ${issue.message}`,
      `   Location: ${formatValidationPath(issue.path)}`,
      `   Fix: ${validationFix(issue)}`,
    );
  });
  return lines.join("\n");
}

function formatValidationPath(path: string): string {
  if (path === "/") return "document root (/)";
  const segments = path.split("/").filter(Boolean);
  const readable = segments.reduce((current, segment) =>
    /^\d+$/.test(segment)
      ? `${current}[${segment}]`
      : current.length === 0
        ? segment
        : `${current}.${segment}`,
  "");
  return `${readable} (${path})`;
}

function validationFix(issue: ValidationIssue): string {
  const unknownComponent = issue.message.match(/Unknown component '([^']+)'/);
  if (unknownComponent) {
    return `Add '${unknownComponent[1]}' under components, or change this reference to an existing component.`;
  }
  if (issue.message.includes("Map keys must be unique")) {
    return "Remove or rename the duplicate YAML key.";
  }
  if (issue.message.includes("required property")) {
    return "Add the required field at this location.";
  }
  if (issue.message.includes("equal to one of the allowed values")) {
    return "Use one of the values allowed by the architecture schema.";
  }
  if (/^must be (array|boolean|integer|null|number|object|string)$/.test(issue.message)) {
    return "Change the value to the type required by the architecture schema.";
  }
  if (issue.message.includes("must match pattern") || issue.message.includes("property name")) {
    return "Rename or rewrite this value so it matches the architecture schema.";
  }
  if (issue.message.includes("additional properties")) {
    return "Remove the unsupported field or add it to the schema before using it.";
  }
  return "Update this value so it satisfies the architecture schema and semantic rules.";
}
