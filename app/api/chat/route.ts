import { NextRequest, NextResponse } from "next/server";
import { getAnthropic, MODEL_ID } from "@/lib/anthropic";
import { SYSTEM_PROMPT, buildGotchaContext } from "@/lib/prompt";
import type { ChatRequest, ChatResponse, TurnMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseReply(raw: string): ChatResponse {
  const trimmed = raw.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1) {
    return { reply: trimmed, choices: ["続ける"], allowFreeText: false };
  }
  const slice = trimmed.slice(first, last + 1);
  try {
    const parsed = JSON.parse(slice) as Partial<ChatResponse>;
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : trimmed,
      choices:
        Array.isArray(parsed.choices) && parsed.choices.length > 0
          ? parsed.choices.map((c) => String(c)).slice(0, 4)
          : ["続ける"],
      allowFreeText: Boolean(parsed.allowFreeText),
    };
  } catch {
    return { reply: trimmed, choices: ["続ける"], allowFreeText: false };
  }
}

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const messages: TurnMessage[] = Array.isArray(body.messages)
    ? body.messages
    : [];
  const gotchaLog = Array.isArray(body.gotchaLog) ? body.gotchaLog : [];

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "messages required" },
      { status: 400 },
    );
  }

  try {
    const anthropic = getAnthropic();
    const result = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: buildGotchaContext(gotchaLog),
        },
      ],
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const textBlock = result.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = parseReply(raw);
    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
