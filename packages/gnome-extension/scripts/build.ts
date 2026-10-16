// Bundles the extension (with @sun-clock/core inlined), its compiled GSettings schema and its
// compiled translations into dist/.
// With --install, also copies dist/ into the user's GNOME Shell extensions directory.
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { gettextDomain, languages, poDirectory, root, run } from "./i18n.ts";

const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist);

await build({
  entryPoints: [join(root, "src/extension.ts"), join(root, "src/prefs.ts")],
  outdir: dist,
  bundle: true,
  format: "esm",
  target: "es2023",
  // Readable output is required by extensions.gnome.org reviewers.
  minify: false,
  external: ["gi://*", "resource://*", "gettext", "system", "cairo"],
});

await cp(join(root, "metadata.json"), join(dist, "metadata.json"));
await cp(join(root, "stylesheet.css"), join(dist, "stylesheet.css"));

await cp(join(root, "schemas"), join(dist, "schemas"), { recursive: true });
await run("glib-compile-schemas", ["--strict", join(dist, "schemas")]);

const domain = await gettextDomain();
for (const language of await languages()) {
  const directory = join(dist, "locale", language, "LC_MESSAGES");
  await mkdir(directory, { recursive: true });
  await run("msgfmt", [
    "--check",
    `--output-file=${join(directory, `${domain}.mo`)}`,
    join(poDirectory, `${language}.po`),
  ]);
}

if (process.argv.includes("--install")) {
  const metadata: { uuid: string } = JSON.parse(
    await readFile(join(root, "metadata.json"), "utf8"),
  );
  const target = join(homedir(), ".local/share/gnome-shell/extensions", metadata.uuid);
  await rm(target, { recursive: true, force: true });
  await cp(dist, target, { recursive: true });
  console.log(`Installed to ${target}`);
}
