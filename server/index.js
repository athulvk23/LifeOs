import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.ASSISTANT_SERVER_PORT || 3001;
const API_KEY = process.env.GEMINI_API_KEY;
const rawModel = process.env.GEMINI_MODEL;
const MODEL = rawModel === "gemini-2.5-flash" ? "gemini-1.5-pro" : rawModel || "gemini-1.5-pro";

if (!API_KEY) {
  console.warn(
    "\n⚠️  GEMINI_API_KEY is not set. Create a .env file with:\n" +
    "    GEMINI_API_KEY=your-key-here\n" +
    "Get a key at https://console.cloud.google.com/apis/credentials\n" +
    "The Assistant will not work until this is set.\n"
  );
}

if (rawModel && rawModel !== MODEL) {
  console.warn(`\n⚠️  GEMINI_MODEL value '${rawModel}' is deprecated or unavailable. Falling back to '${MODEL}'.\n`);
}

function toGeminiContents(messages) {
  const idToName = {};
  const contents = [];

  for (const msg of messages) {
    const isBlockArray = Array.isArray(msg.content);

    if (!isBlockArray) {
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts: [{ text: msg.content }] });
      continue;
    }

    const hasToolResult = msg.content.some(block => block.type === "tool_result");
    const parts = [];

    for (const block of msg.content) {
      if (block.type === "text") {
        parts.push({ text: block.text });
      } else if (block.type === "tool_use") {
        idToName[block.id] = block.name;
        parts.push({ functionCall: { name: block.name, args: block.input } });
      } else if (block.type === "tool_result") {
        const name = idToName[block.tool_use_id] || "unknown_tool";
        parts.push({ functionResponse: { name, response: { result: block.content } } });
      }
    }

    contents.push({ role: hasToolResult ? "function" : (msg.role === "assistant" ? "model" : "user"), parts });
  }

  return contents;
}

function toGeminiTools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
}

function fromGeminiResponse(data) {
  const candidate = data.candidates && data.candidates[0];
  if (!candidate) {
    return { content: [{ type: "text", text: "Sorry, I didn't get a usable response." }], stop_reason: "end_turn" };
  }

  const parts = candidate.content?.parts || [];
  let callIdx = 0;

  const content = parts.map(part => {
    if (part.functionCall) {
      callIdx += 1;
      return {
        type: "tool_use",
        id: `call_${Date.now()}_${callIdx}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      };
    }

    const text = typeof part.text === "string"
      ? part.text
      : typeof part.content === "string"
        ? part.content
        : typeof part.output_text === "string"
          ? part.output_text
          : "";

    return { type: "text", text };
  });

  if (content.length === 0 && typeof candidate.content === "string") {
    return { content: [{ type: "text", text: candidate.content }], stop_reason: "end_turn" };
  }

  if (content.length === 0 && typeof candidate.output_text === "string") {
    return { content: [{ type: "text", text: candidate.output_text }], stop_reason: "end_turn" };
  }

  const hasToolCall = content.some(c => c.type === "tool_use");
  return { content, stop_reason: hasToolCall ? "tool_use" : "end_turn" };
}

app.post("/api/assistant", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "Server is missing GEMINI_API_KEY. Add it to .env and restart the server." });
  }

  const { messages, system, tools } = req.body || {};
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "Request body must include a `messages` array." });
  }

  try {
    const geminiBody = {
      contents: toGeminiContents(messages),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(toGeminiTools(tools) ? { tools: toGeminiTools(tools) } : {}),
    };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(response.status).json(data);
    }

    return res.json(fromGeminiResponse(data));
  } catch (err) {
    console.error("Assistant proxy error:", err);
    res.status(500).json({ error: "Failed to reach Gemini API." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, keyConfigured: !!API_KEY, model: MODEL }));

app.listen(PORT, () => {
  console.log(`LifeOS Assistant backend (Gemini) running at http://localhost:${PORT}`);
});
