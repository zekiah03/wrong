export type Role = "user" | "assistant";

export type TurnMessage = {
  role: Role;
  content: string;
};

export type ChatRequest = {
  messages: TurnMessage[];
  gotchaLog?: GotchaEntry[];
};

export type Theme = "意識" | "感情" | "身体" | "DNA" | "メタ";

export type ChatResponse = {
  headline: string;
  reply: string;
  choices: string[];
  allowFreeText?: boolean;
  theme?: Theme;
};

export type Turn = {
  headline?: string;
  question: string;
  choices: string[];
  allowFreeText: boolean;
  chosen?: string;
  theme?: Theme;
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
