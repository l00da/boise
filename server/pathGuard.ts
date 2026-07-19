import path from "node:path";

export class PathTraversalError extends Error {
  constructor(message = "Path escapes data root") {
    super(message);
    this.name = "PathTraversalError";
  }
}

/** Resolve a path strictly under `dataRoot`. Rejects `..` segments and escapes. */
export function resolveUnderRoot(dataRoot: string, ...segments: string[]): string {
  for (const seg of segments) {
    if (seg.includes("..") || path.isAbsolute(seg)) {
      throw new PathTraversalError(`Invalid path segment: ${seg}`);
    }
  }
  const root = path.resolve(dataRoot);
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new PathTraversalError();
  }
  return resolved;
}

export function assertValidId(id: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id)) {
    throw new PathTraversalError(`Invalid ${label}: ${id}`);
  }
}
