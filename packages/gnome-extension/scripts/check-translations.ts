// Fails when a translatable message in the sources lacks an up-to-date translation in any
// language. Run `pnpm update-po` and translate the new messages to fix it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractMessages, languages, poDirectory, run } from "./i18n.ts";

const workDirectory = await mkdtemp(join(tmpdir(), "vesperal-i18n-"));
try {
  const template = join(workDirectory, "messages.pot");
  await extractMessages(template);
  for (const language of await languages()) {
    // msgcmp treats untranslated and fuzzy messages as missing.
    await run("msgcmp", [join(poDirectory, `${language}.po`), template]);
    await run("msgfmt", [
      "--check",
      "--output-file=/dev/null",
      join(poDirectory, `${language}.po`),
    ]);
  }
} catch (error) {
  const { stderr } = error as { stderr?: string };
  console.error(stderr || error);
  process.exitCode = 1;
} finally {
  await rm(workDirectory, { recursive: true, force: true });
}
