import { NextRequest, NextResponse } from "next/server";
import { getAnthropic, MODEL_ID } from "@/lib/anthropic";
import {
  SYSTEM_PROMPT,
  buildGotchaContext,
  TRIM_THRESHOLD,
  KEEP_RECENT,
} from "@/lib/prompt";
import type {
  ChatRequest,
  ChatResponse,
  Theme,
  TurnMessage,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const THEMES: Theme[] = ["意識", "感情", "身体", "DNA", "メタ"];

function parseReply(raw: string): ChatResponse {
  const trimmed = raw.trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  const fallback: ChatResponse = {
    reply: trimmed,
    choices: ["続ける"],
    allowFreeText: false,
    theme: "メタ",
  };
  if (first === -1 || last === -1) return fallback;
  const slice = trimmed.slice(first, last + 1);
  try {
    const parsed = JSON.parse(slice) as Partial<ChatResponse>;
    const theme =
      typeof parsed.theme === "string" &&
      (THEMES as string[]).includes(parsed.theme)
        ? (parsed.theme as Theme)
        : "メタ";
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : trimmed,
      choices:
        Array.isArray(parsed.choices) && parsed.choices.length > 0
          ? parsed.choices.map((c) => String(c)).slice(0, 4)
          : ["続ける"],
      allowFreeText: Boolean(parsed.allowFreeText),
      theme,
    };
  } catch {
    return fallback;
  }
}

function trimMessages(messages: TurnMessage[]): {
  sent: TurnMessage[];
  trimmed: boolean;
} {
  if (messages.length <= TRIM_THRESHOLD) {
    return { sent: messages, trimmed: false };
  }
  const tail = messages.slice(-KEEP_RECENT);
  // Ensure the first sent message is a user turn so the API accepts it.
  const firstUser = tail.findIndex((m) => m.role === "user");
  const safeTail = firstUser === -1 ? messages.slice(-1) : tail.slice(firstUser);
  return { sent: safeTail, trimmed: true };
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

  const { sent, trimmed } = trimMessages(messages);

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
          text: buildGotchaContext(gotchaLog, trimmed),
        },
      ],
      messages: sent.map((m) => ({
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
