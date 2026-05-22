import type { NodeHandler, TextPayload } from "@brain/sdk";
import { CLIRegistry, execCommand } from "@brain/core";

export const handler: NodeHandler = async (ctx) => {
  const overrides = ctx.node.config_overrides ?? {} as Record<string, unknown>;
  const cli = (overrides.cli as string | undefined) ?? "claude";
  const timeoutMs = (overrides.timeout_ms as number | undefined) ?? 120000;
  const cwd = (overrides.cwd as string | undefined) ?? process.cwd();
  const maxOutput = (overrides.max_output as number | undefined) ?? 50000;

  const registry = CLIRegistry.getInstance();

  if (!registry.isAvailable(cli)) {
    ctx.respond(JSON.stringify({
      error: `CLI agent unavailable: ${cli}`,
      available: registry.getAvailableCLIs(),
    }));
    return;
  }

  for (const msg of ctx.messages) {
    const prompt = (msg.payload as TextPayload).content;
    if (!prompt) continue;

    const command = registry.buildCommand(cli, prompt);

    try {
      const result = await execCommand(command, { cwd, timeoutMs, signal: ctx.signal });
      const output = result.stdout || result.stderr;
      const truncated = output.length > maxOutput ? `${output.slice(0, maxOutput)}\n... (truncated)` : output;

      // Try to parse JSON output (Claude and Gemini return JSON)
      let parsedContent = truncated;
      try {
        const parsed = JSON.parse(truncated) as Record<string, unknown>;
        if (typeof parsed.result === "string") parsedContent = parsed.result;
        else if (typeof parsed.response === "string") parsedContent = parsed.response;
      } catch { /* Not JSON, use raw output */ }

      ctx.respond(parsedContent, { cli, exit_code: result.exitCode });
    } catch (err) {
      ctx.respond(JSON.stringify({
        error: `CLI execution failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  }
};
