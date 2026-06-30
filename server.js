const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";

const STYLE_INSTRUCTIONS = {
  Normal: "Read in a clear, natural documentary narration voice. Keep the delivery neutral and easy to understand.",
  Dramatic: "Read slowly with a dramatic, suspenseful tone. Add gravity and tension, but keep the words clear.",
  "Breaking News": "Read like an urgent breaking news anchor. Use a confident, fast-paced, energetic delivery.",
  "Bedtime Story": "Read softly and calmly, like a gentle bedtime story narrator. Use a warm and soothing tone.",
  "Movie Trailer": "Read in a deep, cinematic movie trailer style. Use a slow, powerful, suspenseful delivery."
};

app.use(express.json({ limit: "20kb" }));

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }

  return next(error);
});

app.use(express.static(__dirname));

app.post("/api/tts", async (req, res) => {
  const { text, style } = req.body || {};
  const trimmedText = typeof text === "string" ? text.trim() : "";

  if (!trimmedText) {
    return res.status(400).json({ error: "Text is required and must be a non-empty string." });
  }

  if (trimmedText.length > 1000) {
    return res.status(400).json({ error: "Text must be 1000 characters or fewer." });
  }

  if (!Object.prototype.hasOwnProperty.call(STYLE_INSTRUCTIONS, style)) {
    return res.status(400).json({
      error: "Style must be one of: Normal, Dramatic, Breaking News, Bedtime Story, Movie Trailer."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI API key is not configured on the server." });
  }

  try {
    const openAIResponse = await fetch(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "coral",
        input: trimmedText,
        instructions: STYLE_INSTRUCTIONS[style],
        response_format: "mp3"
      })
    });

    if (!openAIResponse.ok) {
      const detail = await readOpenAIError(openAIResponse);
      console.error("OpenAI speech API error", {
        status: openAIResponse.status,
        statusText: openAIResponse.statusText,
        detail
      });

      return res.status(502).json({ error: "Could not generate audio right now. Please try again later." });
    }

    const audioBuffer = Buffer.from(await openAIResponse.arrayBuffer());

    res.status(200);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("Cache-Control", "no-store");
    return res.send(audioBuffer);
  } catch (error) {
    console.error("TTS request failed", error);
    return res.status(502).json({ error: "Could not generate audio right now. Please try again later." });
  }
});

async function readOpenAIError(response) {
  try {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await response.json();
      return JSON.stringify({ error: body.error?.message || body.error || body });
    }

    const body = await response.text();
    return body.slice(0, 500);
  } catch (error) {
    return "Unable to read OpenAI error body.";
  }
}

app.listen(PORT, () => {
  console.log(`History today is running at http://localhost:${PORT}`);
});
