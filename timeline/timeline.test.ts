import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import type { PluginInput, PluginOptions } from "@opencode-ai/plugin"
import * as module from "./index.ts"

const originalTZ = process.env.TZ
const localeKeys = ["LANG", "LC_ALL", "LC_MESSAGES"] as const
let originalLocale: Record<string, string | undefined>
beforeEach(() => {
  originalLocale = Object.fromEntries(localeKeys.map((key) => [key, process.env[key]]))
  for (const key of localeKeys) delete process.env[key]
})

afterEach(() => {
  setSystemTime()
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
  for (const key of localeKeys) {
    if (originalLocale[key] === undefined) delete process.env[key]
    else process.env[key] = originalLocale[key]
  }
})

async function complete(text: string, partID = "part-1", options?: PluginOptions) {
  const hooks = await module.default({} as PluginInput, options)
  expect(hooks["experimental.text.complete"]).toBeFunction()
  const output = { text }
  await hooks["experimental.text.complete"]!({ sessionID: "session-1", messageID: "message-1", partID }, output)
  return output.text
}

function freezeClock(instant = "2026-01-15T08:04:05Z") {
  process.env.TZ = "America/New_York"
  setSystemTime(new Date(instant))
}

test("appends the exact footer to nonempty text using zero-padded local time", async () => {
  freezeClock()
  expect(await complete("Answer with model-generated time 19:22:33.")).toBe(
    "Answer with model-generated time 19:22:33.\n\n[Finished at 03:04:05]",
  )
})

test("uses the local clock including daylight saving time", async () => {
  freezeClock("2026-07-15T08:04:05Z")
  expect(await complete("Answer")).toBe("Answer\n\n[Finished at 04:04:05]")
})

test("preserves the existing text including trailing whitespace", async () => {
  freezeClock()
  expect(await complete("  Answer\n ")).toBe("  Answer\n \n\n[Finished at 03:04:05]")
})

test.each(["", " ", "\n\t\r "])("leaves blank text unchanged: %j", async (text) => {
  expect(await complete(text)).toBe(text)
})

test("leaves an existing trailing footer and its timestamp unchanged", async () => {
  freezeClock()
  const text = "Answer\n\n[Finished at 23:59:59]\n "
  expect(await complete(text)).toBe(text)
})

test("repeated completion does not append another footer", async () => {
  freezeClock()
  const text = await complete("Answer")
  setSystemTime(new Date("2026-01-15T09:05:06Z"))
  expect(await complete(text)).toBe(text)
})

test("timestamps each completed block independently, even in the same message", async () => {
  freezeClock()
  expect(await complete("First block", "part-1")).toBe("First block\n\n[Finished at 03:04:05]")
  setSystemTime(new Date("2026-01-15T09:05:06Z"))
  expect(await complete("Second block", "part-2")).toBe("Second block\n\n[Finished at 04:05:06]")
})

test("does not mistake a footer quoted earlier in the text for a trailing footer", async () => {
  freezeClock()
  const text = "Example: [Finished at 12:34:56]\nMore text"
  expect(await complete(text)).toBe(`${text}\n\n[Finished at 03:04:05]`)
})

test("uses a custom label from the plugin's second argument", async () => {
  freezeClock()
  expect(await complete("Answer", "part-1", { label: "Finished at" })).toBe(
    "Answer\n\n[Finished at 03:04:05]",
  )
})

test.each([undefined, null, 42, false, "", " \n\t "])("falls back for an invalid label: %j", async (label) => {
  freezeClock()
  expect(await complete("Answer", "part-1", { label })).toBe("Answer\n\n[Finished at 03:04:05]")
})

test("keeps the default unchanged when the options object is empty", async () => {
  freezeClock()
  expect(await complete("Answer", "part-1", {})).toBe("Answer\n\n[Finished at 03:04:05]")
})

test.each([
  ["en", "Finished at"],
  ["es", "Finalizado a las"],
  ["pt", "Finalizado às"],
  ["fr", "Terminé à"],
  ["de", "Beendet um"],
  ["it", "Finito alle"],
])("uses the built-in label for locale %s", async (locale, label) => {
  freezeClock()
  expect(await complete("Answer", "part-1", { locale })).toBe(`Answer\n\n[${label} 03:04:05]`)
})

test.each([
  ["ES", "Finalizado a las"],
  ["es-ES", "Finalizado a las"],
  ["PT_br", "Finalizado às"],
  ["de_DE.UTF-8", "Beendet um"],
  ["fr.UTF-8", "Terminé à"],
  ["it@euro", "Finito alle"],
  [" e1s! ", "Finalizado a las"],
])("normalizes locale %s to its alphabetic base language", async (locale, label) => {
  freezeClock()
  expect(await complete("Answer", "part-1", { locale })).toBe(`Answer\n\n[${label} 03:04:05]`)
})

test("uses a nonblank custom label verbatim ahead of locale and system detection", async () => {
  freezeClock()
  process.env.LC_ALL = "de_DE.UTF-8"
  expect(await complete("Answer", "part-1", { label: "  Custom [label]  ", locale: "fr" })).toBe(
    "Answer\n\n[  Custom [label]   03:04:05]",
  )
})

test.each([undefined, null, 42, false, "", " \n\t "])("ignores invalid labels before resolving locale: %j", async (label) => {
  freezeClock()
  expect(await complete("Answer", "part-1", { label, locale: "pt" })).toBe("Answer\n\n[Finalizado às 03:04:05]")
})

test.each([undefined, null, 42, false, {}, [], "", " \n\t "])("ignores invalid locale options and uses system detection: %j", async (locale) => {
  freezeClock()
  process.env.LANG = "es_ES.UTF-8"
  expect(await complete("Answer", "part-1", { locale })).toBe("Answer\n\n[Finalizado a las 03:04:05]")
})

test("detects the locale from LANG", async () => {
  freezeClock()
  process.env.LANG = "es_ES.UTF-8"
  expect(await complete("Answer")).toBe("Answer\n\n[Finalizado a las 03:04:05]")
})

test("resolves LC_ALL before LC_MESSAGES before LANG", async () => {
  freezeClock()
  process.env.LANG = "es_ES.UTF-8"
  process.env.LC_MESSAGES = "fr_FR.UTF-8"
  process.env.LC_ALL = "de_DE.UTF-8"
  expect(await complete("Answer")).toBe("Answer\n\n[Beendet um 03:04:05]")
  delete process.env.LC_ALL
  expect(await complete("Answer")).toBe("Answer\n\n[Terminé à 03:04:05]")
  delete process.env.LC_MESSAGES
  expect(await complete("Answer")).toBe("Answer\n\n[Finalizado a las 03:04:05]")
})

test.each(["C", "C.UTF-8", "POSIX", "posix", "", " \n\t ", "123", "_es", "ja_JP.UTF-8"])("falls back to English for unsupported system locale %j", async (locale) => {
  freezeClock()
  for (const key of localeKeys) process.env[key] = locale
  expect(await complete("Answer")).toBe("Answer\n\n[Finished at 03:04:05]")
})

test.each(["C.UTF-8", "POSIX", "", "123", "ja_JP.UTF-8"])("skips unmatched higher-priority system locales: %j", async (locale) => {
  freezeClock()
  process.env.LC_ALL = locale
  process.env.LC_MESSAGES = locale
  process.env.LANG = "pt_BR.UTF-8"
  expect(await complete("Answer")).toBe("Answer\n\n[Finalizado às 03:04:05]")
})

test("an explicit supported locale overrides the system locale", async () => {
  freezeClock()
  process.env.LC_ALL = "es_ES.UTF-8"
  expect(await complete("Answer", "part-1", { locale: "fr" })).toBe("Answer\n\n[Terminé à 03:04:05]")
})

test.each(["ja", "unknown", "123", "C", "POSIX", "_es", "constructor", "toString", "__proto__"])("falls back to English without detecting the system for explicit locale %j", async (locale) => {
  freezeClock()
  process.env.LC_ALL = "es_ES.UTF-8"
  expect(await complete("Answer", "part-1", { locale })).toBe("Answer\n\n[Finished at 03:04:05]")
})

test("preserves a trailing locale-derived footer and its whitespace on repeated completion", async () => {
  freezeClock()
  const options = { locale: "pt_BR" }
  const text = await complete("Answer", "part-1", options)
  expect(text).toBe("Answer\n\n[Finalizado às 03:04:05]")
  setSystemTime(new Date("2026-01-15T09:05:06Z"))
  expect(await complete(`${text}\n `, "part-1", options)).toBe(`${text}\n `)
})

test("does not mistake a mid-text locale-derived footer for a trailing footer", async () => {
  freezeClock()
  const text = "Example: [Terminé à 12:34:56]\nMore text"
  expect(await complete(text, "part-1", { locale: "fr" })).toBe(`${text}\n\n[Terminé à 03:04:05]`)
})

test("custom labels with regex characters remain idempotent", async () => {
  freezeClock()
  const options = { label: "Finished [at] (local).*+?^$|\\{time}" }
  const text = await complete("Answer", "part-1", options)
  expect(text).toBe(`Answer\n\n[${options.label} 03:04:05]`)
  setSystemTime(new Date("2026-01-15T09:05:06Z"))
  expect(await complete(`${text}\n `, "part-1", options)).toBe(`${text}\n `)
})

test("does not treat regex metacharacters in the label as wildcards", async () => {
  freezeClock()
  const text = "Answer\n\n[FinishedXat 12:34:56]"
  expect(await complete(text, "part-1", { label: "Finished.at" })).toBe(
    `${text}\n\n[Finished.at 03:04:05]`,
  )
})

test("only recognizes the configured label as an existing footer", async () => {
  freezeClock()
  const text = "Answer\n\n[Finalizado a las 12:34:56]"
  expect(await complete(text, "part-1", { label: "Finished at" })).toBe(`${text}\n\n[Finished at 03:04:05]`)
})

test("exports one plugin and has no event logger or filesystem dependency", async () => {
  expect(Object.keys(module)).toEqual(["default"])
  const hooks = await module.default({} as PluginInput)
  expect(Object.keys(hooks)).toEqual(["experimental.text.complete"])
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text()
  expect(source).not.toContain("node:fs")
  expect(source).not.toContain("timeline.log")
})
