// api/hookbrain.js
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async (req, res) => {
  // === CORS PRE-FLIGHT ===
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // === ALWAYS ALLOW CORS ON ACTUAL REQUESTS ===
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Parse body
    const { niche, tone, goal, topic } = req.body || {};
    if (!niche || !tone || !goal || !topic) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Call OpenAI
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a viral content strategist." },
        {
          role: "user",
          content: `Niche: ${niche}\nTone: ${tone}\nGoal: ${goal}\nTopic: ${topic}`,
        },
      ],
    });

    // Extract captions
    const text = chat.choices?.[0]?.message?.content || "";
    const captions = text.split("\n").filter((line) => line.trim());

    return res.status(200).json({ captions });
  } catch (err) {
    console.error("hookbrain error:", err);
    return res.status(500).json({ error: err.message || "Server Error" });
  }
};
