// Transpiles the extension and the parts of @vesperal/core it uses, one file per module, and
// copies its GSettings schema and its compiled translations into dist/.
// With --install, also copies dist/ into the user's GNOME Shell extensions directory and compiles
// the schema there.
// With --pack, also zips dist/ into <uuid>.shell-extension.zip, for extensions.gnome.org.
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { build } from "esbuild";
import { gettextDomain, languages, poDirectory, root, run } from "./i18n.ts";

const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist);

const external = ["gi://*", "resource://*", "gettext", "system", "cairo"];
const coreSources = join(root, "../core/src");

// The modules the extension and its preferences import, found by bundling them without output.
const { metafile } = await build({
  entryPoints: [join(root, "src/extension.ts"), join(root, "src/prefs.ts")],
  outdir: dist,
  bundle: true,
  write: false,
  metafile: true,
  absWorkingDir: root,
  format: "esm",
  external,
});
const modules = Object.keys(metafile.inputs).map((input) => resolve(root, input));

/** Where a module lands in dist/, without its extension: the core goes into core/. */
function outputOf(module: string): string {
  const fromCore = relative(coreSources, module);
  const path = fromCore.startsWith("..")
    ? relative(join(root, "src"), module)
    : join("core", fromCore);
  return path.replace(/\.ts$/, "");
}

// Each module is transpiled to a file of its own, its imports pointed at the other files, so
// that the package reads like the sources: extensions.gnome.org reviewers require readable code.
await build({
  entryPoints: modules.map((module) => ({ in: module, out: outputOf(module) })),
  outdir: dist,
  bundle: true,
  format: "esm",
  target: "es2023",
  minify: false,
  external,
  plugins: [
    {
      name: "module-per-file",
      setup(builder) {
        builder.onResolve({ filter: /^(\.|@vesperal\/)/ }, async (args) => {
          if (args.kind === "entry-point" || args.pluginData?.resolving) return undefined;
          const resolved = await builder.resolve(args.path, {
            kind: args.kind,
            resolveDir: args.resolveDir,
            pluginData: { resolving: true },
          });
          const from = dirname(outputOf(args.importer));
          const path = relative(from, outputOf(resolved.path)).split(sep).join("/");
          return { path: `${path.startsWith(".") ? "" : "./"}${path}.js`, external: true };
        });
      },
    },
  ],
});

await cp(join(root, "metadata.json"), join(dist, "metadata.json"));
await cp(join(root, "stylesheet.css"), join(dist, "stylesheet.css"));

await cp(join(root, "schemas"), join(dist, "schemas"), { recursive: true });
// Only checked: GNOME Shell 45+ compiles the schema on install, so the package must not ship it.
await run("glib-compile-schemas", ["--strict", "--dry-run", join(dist, "schemas")]);

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

const metadata: { uuid: string } = JSON.parse(await readFile(join(root, "metadata.json"), "utf8"));

if (process.argv.includes("--pack")) {
  const archive = join(root, `${metadata.uuid}.shell-extension.zip`);
  await rm(archive, { force: true });
  // -X leaves out file attributes that would make the archive differ from one build to another.
  await run("zip", ["-r", "-X", "-q", archive, "."], { cwd: dist });
  console.log(`Packed ${archive}`);
}

if (process.argv.includes("--install")) {
  const target = join(homedir(), ".local/share/gnome-shell/extensions", metadata.uuid);
  await rm(target, { recursive: true, force: true });
  await cp(dist, target, { recursive: true });
  // Copying by hand skips the install step that compiles the schema.
  await run("glib-compile-schemas", ["--strict", join(target, "schemas")]);
  console.log(`Installed to ${target}`);
}
