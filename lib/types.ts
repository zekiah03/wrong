export type Role = "user" | "assistant";

export type TurnMessage = {
  role: Role;
  content: string;
};

export type ChatRequest = {
  messages: TurnMessage[];
};

export type ChatResponse = {
  reply: string;
  choices: string[];
  allowFreeText?: boolean;
};
