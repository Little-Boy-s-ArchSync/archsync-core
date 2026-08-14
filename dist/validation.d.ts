import { type ErrorObject } from "ajv/dist/2020.js";
import type { ArchitectureDocument, ValidationIssue, ValidationResult } from "./model.js";
export declare function formatSchemaIssue(error: ErrorObject): ValidationIssue;
export declare function validateArchitectureSemantics(value: ArchitectureDocument): ValidationIssue[];
export declare function parseArchitecture(source: string): Promise<ValidationResult<ArchitectureDocument>>;
export declare function loadArchitecture(filePath: string): Promise<ValidationResult<ArchitectureDocument>>;
export declare function formatValidationIssues(issues: ValidationIssue[]): string;
//# sourceMappingURL=validation.d.ts.map