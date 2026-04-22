export type Role = "user" | "assistant";

export type TurnMessage = {
  role: Role;
  content: string;
};

export type ChatRequest = {
  messages: TurnMessage[];
  gotchaLog?: GotchaEntry[];
};

export type ChatResponse = {
  reply: string;
  choices: string[];
  allowFreeText?: boolean;
};

export type Turn = {
  question: string;
  choices: string[];
  allowFreeText: boolean;
  chosen?: string;
};

export type GotchaEntry = {
  turnIndex: number;
  timestamp: number;
  question: string;
  chosen: string;
  freeText: boolean;
};

export type StoredSession = {
  version: 1;
  sessionId: string;
  messages: TurnMessage[];
  turns: Turn[];
  gotchaLog: GotchaEntry[];
};
