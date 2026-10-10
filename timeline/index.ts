import type { Plugin } from "@opencode-ai/plugin"

// Best-effort footer for each completed text block, not a full-turn boundary.
const timelinePlugin: Plugin = async () => {
  return {
    "experimental.text.complete": async (_input, output) => {
      if (!output.text.trim() || /\[Finalizado a las \d{2}:\d{2}:\d{2}\]\s*$/.test(output.text)) return

      const now = new Date()
      const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((value) => String(value).padStart(2, "0"))
        .join(":")
      output.text += `\n\n[Finalizado a las ${time}]`
    },
  }
}

export default timelinePlugin
