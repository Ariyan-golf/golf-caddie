import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const GOLF_SYSTEM_PROMPT = `あなたはプロのゴルフキャディです。ゴルファーの状況を分析し、日本語で具体的かつ実践的なアドバイスを提供します。
アドバイスは簡潔で分かりやすく、スコアアップに直結する内容にしてください。`;
