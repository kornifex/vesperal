// Refreshes the POT template from the sources and merges it into every translation.
import { join } from "node:path";
import { extractMessages, gettextDomain, languages, poDirectory, run } from "./i18n.ts";

const template = join(poDirectory, `${await gettextDomain()}.pot`);
await extractMessages(template);
for (const language of await languages()) {
  await run("msgmerge", [
    "--quiet",
    "--update",
    "--backup=none",
    join(poDirectory, `${language}.po`),
    template,
  ]);
}
