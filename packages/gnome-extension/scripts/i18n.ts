// Shared gettext plumbing for the build and translation scripts.
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

export const run = promisify(execFile);

export const root = join(import.meta.dirname, "..");
export const poDirectory = join(root, "po");
const repositoryRoot = join(root, "../..");

// Translatable messages: `_()` in the extension, and `translate()` in the core, which receives
// gettext by injection.
const SOURCE_DIRECTORIES = [join(root, "src"), join(repositoryRoot, "packages/core/src")];

export async function gettextDomain(): Promise<string> {
  const metadata: { "gettext-domain": string } = JSON.parse(
    await readFile(join(root, "metadata.json"), "utf8"),
  );
  return metadata["gettext-domain"];
}

/** The languages with a translation, from the `po/<language>.po` files. */
export async function languages(): Promise<string[]> {
  const files = await readdir(poDirectory);
  return files.filter((file) => file.endsWith(".po")).map((file) => file.slice(0, -".po".length));
}

/** Extracts every translatable message from the sources into a POT file at `output`. */
export async function extractMessages(output: string): Promise<void> {
  const sources: string[] = [];
  for (const directory of SOURCE_DIRECTORIES) {
    const files = await readdir(directory, { recursive: true });
    sources.push(
      ...files
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
        .map((file) => relative(repositoryRoot, join(directory, file))),
    );
  }
  await run(
    "xgettext",
    [
      "--language=TypeScript",
      "--from-code=UTF-8",
      "--keyword=_",
      "--keyword=translate",
      "--add-comments=Translators:",
      `--package-name=${await gettextDomain()}`,
      "--sort-by-file",
      "--msgid-bugs-address=https://github.com/kornifex/vesperal/issues",
      `--output=${output}`,
      ...sources.sort(),
    ],
    { cwd: repositoryRoot },
  );
}
