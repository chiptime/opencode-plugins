import type { Plugin, PluginOptions } from "@opencode-ai/plugin"

const labels: Record<string, string> = {
  en: "Finished at",
  es: "Finalizado a las",
  pt: "Finalizado às",
  fr: "Terminé à",
  de: "Beendet um",
  it: "Finito alle",
}

function localizedLabel(locale: unknown): string | undefined {
  if (typeof locale !== "string") return
  const language = locale.toLowerCase().split(/[_\-.@]/, 1)[0].replace(/[^a-z]/g, "")
  return Object.hasOwn(labels, language) ? labels[language] : undefined
}

function resolveLabel(options?: PluginOptions): string {
  if (typeof options?.label === "string" && options.label.trim()) return options.label
  // A nonblank explicit locale opts out of system detection, even if unsupported.
  if (typeof options?.locale === "string" && options.locale.trim()) {
    return localizedLabel(options.locale) ?? labels.en
  }
  for (const locale of [process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]) {
    const label = localizedLabel(locale)
    if (label) return label
  }
  return labels.en
}

// Best-effort footer for each completed text block, not a full-turn boundary.
const timelinePlugin: Plugin = async (_input, options) => {
  const label = resolveLabel(options)
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const footer = new RegExp(`\\[${escapedLabel} \\d{2}:\\d{2}:\\d{2}\\]\\s*$`)

  return {
    "experimental.text.complete": async (_input, output) => {
      if (!output.text.trim() || footer.test(output.text)) return

      const now = new Date()
      const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((value) => String(value).padStart(2, "0"))
        .join(":")
      output.text += `\n\n[${label} ${time}]`
    },
  }
}

export default timelinePlugin
