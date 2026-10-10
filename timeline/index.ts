import type { Plugin } from "@opencode-ai/plugin"

// Best-effort footer for each completed text block, not a full-turn boundary.
const timelinePlugin: Plugin = async (_input, options) => {
  const label = typeof options?.label === "string" && options.label.trim() ? options.label : "Finalizado a las"
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
