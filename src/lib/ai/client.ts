import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const MODELS = {
  lookup: process.env.OPENAI_MODEL_LOOKUP ?? "gpt-4o-mini",
  task: process.env.OPENAI_MODEL_TASK ?? "gpt-4o",
  feedback: process.env.OPENAI_MODEL_FEEDBACK ?? "gpt-4o",
  // Structured, low-divergence output — mini is usually enough. Override with
  // OPENAI_MODEL_ENRICH=gpt-4o if quality regresses.
  enrich: process.env.OPENAI_MODEL_ENRICH ?? "gpt-4o-mini",
  transcribe: process.env.OPENAI_MODEL_TRANSCRIBE ?? "whisper-1",
  speaking: process.env.OPENAI_MODEL_SPEAKING ?? "gpt-4o",
} as const;
