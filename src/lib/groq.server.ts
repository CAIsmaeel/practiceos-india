import { createServerFn } from "@tanstack/react-start";

export type GroqMessage = { role: "system" | "user" | "assistant"; content: string };

// Runs on the server only — the TanStack Start compiler strips this handler
// out of the client bundle, so GROQ_API_KEY never ships to the browser and
// the request to Groq is made server-to-server (no browser CORS involved).
export const getGroqCompletion = createServerFn({ method: "POST" })
  .validator((data: { messages: GroqMessage[] }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured on the server");
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 400,
        messages: data.messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq error ${response.status}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json?.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("Empty response from Groq");
    return text.trim();
  });
