import * as path from "path";

export function resolveContainedProjectPath(projectPath: string, requestedPath: string): string {
  const projectRoot = path.resolve(projectPath);
  const fullPath = path.resolve(projectRoot, requestedPath);
  const relativeFromProject = path.relative(projectRoot, fullPath);

  if (relativeFromProject === "") {
    return fullPath;
  }

  if (!relativeFromProject.startsWith("..") && !path.isAbsolute(relativeFromProject)) {
    return fullPath;
  }

  throw new Error("File path is outside project");
}
