import type { NodeHandler, TextPayload, AlertPayload } from "@brain/sdk";

function extractContent(payload: TextPayload | AlertPayload | Record<string, unknown>): string {
  if ("content" in payload && typeof payload.content === "string") return payload.content;
  if ("title" in payload && typeof payload.title === "string") {
    const desc = "description" in payload ? ` ${String(payload.description)}` : "";
    return `${payload.title}${desc}`;
  }
  return JSON.stringify(payload);
}

export const handler: NodeHandler = async (ctx) => {
  const overrides = ctx.node.config_overrides ?? {} as Record<string, unknown>;
  const systemPrompt = (overrides.system_prompt as string | undefined)
    ?? "You are a helpful assistant. Respond concisely.";

  // Persist conversation across iterations
  if (!ctx.state.conversation) ctx.state.conversation = [];
  const conversation = ctx.state.conversation as Array<{ role: "user" | "assistant"; content: string }>;

  for (const msg of ctx.messages) {
    conversation.push({
      role: "user",
      content: `[from:${msg.from} topic:${msg.topic}] ${extractContent(msg.payload as TextPayload)}`,
    });
  }
  while (conversation.length > 40) conversation.shift();

  try {
    const resolution = ctx.llm.resolveModel();
    ctx.log("info", `LLM call → ${resolution.resolved} (${conversation.length} turns)`);
    const content = await ctx.llm.text({
      prompt: conversation,
      system: systemPrompt,
    });
    ctx.log("info", `LLM response (${content.length} chars): ${content.slice(0, 120)}`);
    conversation.push({ role: "assistant", content });
    ctx.respond(content, { model: resolution.resolved, fellBack: resolution.fell_back });
  } catch (err) {
    ctx.respond(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
};
