import { NextRequest } from "next/server";
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

function parseFinal(raw: string): ChatResponse {
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
  try {
    const parsed = JSON.parse(trimmed.slice(first, last + 1)) as Partial<ChatResponse>;
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

// Extract the in-progress content of the "reply" string field from a
// partial JSON buffer. Returns "" if the reply string hasn't started yet.
function extractPartialReply(buf: string): string {
  const m = buf.match(/"reply"\s*:\s*"/);
  if (!m || m.index === undefined) return "";
  const start = m.index + m[0].length;
  let out = "";
  let i = start;
  while (i < buf.length) {
    const ch = buf[i];
    if (ch === "\\") {
      const next = buf[i + 1];
      if (next === undefined) break;
      switch (next) {
        case '"': out += '"'; i += 2; break;
        case "\\": out += "\\"; i += 2; break;
        case "/": out += "/"; i += 2; break;
        case "b": out += "\b"; i += 2; break;
        case "f": out += "\f"; i += 2; break;
        case "n": out += "\n"; i += 2; break;
        case "r": out += "\r"; i += 2; break;
        case "t": out += "\t"; i += 2; break;
        case "u": {
          if (i + 6 > buf.length) return out;
          const hex = buf.slice(i + 2, i + 6);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          break;
        }
        default:
          out += next;
          i += 2;
      }
    } else if (ch === '"') {
      break;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function trimMessages(messages: TurnMessage[]): {
  sent: TurnMessage[];
  trimmed: boolean;
} {
  if (messages.length <= TRIM_THRESHOLD) {
    return { sent: messages, trimmed: false };
  }
  const tail = messages.slice(-KEEP_RECENT);
  const firstUser = tail.findIndex((m) => m.role === "user");
  const safeTail = firstUser === -1 ? messages.slice(-1) : tail.slice(firstUser);
  return { sent: safeTail, trimmed: true };
}

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const messages: TurnMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const gotchaLog = Array.isArray(body.gotchaLog) ? body.gotchaLog : [];

  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { sent, trimmed } = trimMessages(messages);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        const anthropic = getAnthropic();
        const response = anthropic.messages.stream({
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
          messages: sent.map((m) => ({ role: m.role, content: m.content })),
        });

        let accumulated = "";
        let lastReplyLen = 0;

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            accumulated += event.delta.text;
            const reply = extractPartialReply(accumulated);
            if (reply.length > lastReplyLen) {
              send({ type: "reply", text: reply.slice(lastReplyLen) });
              lastReplyLen = reply.length;
            }
          }
        }

        const parsed = parseFinal(accumulated);
        send({
          type: "done",
          reply: parsed.reply,
          choices: parsed.choices,
          allowFreeText: parsed.allowFreeText,
          theme: parsed.theme,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
