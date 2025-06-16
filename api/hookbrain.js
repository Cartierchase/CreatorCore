// api/hookbrain.js
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async (req, res) => {
  // 1) Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // 2) Always allow CORS for actual requests
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    const { niche, tone, goal, topic } = req.body;
    if (!niche || !tone || !goal || !topic) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a viral content strategist…" },
        {
          role: "user",
          content: `Niche: ${niche}\nTone: ${tone}\nGoal: ${goal}\nTopic: ${topic}`
        }
      ]
    });
    const text = chat.choices?.[0]?.message?.content || "";
    const captions = text.split("\n").filter(Boolean);
    return res.status(200).json({ captions });
  } catch (err) {
    console.error("hookbrain error:", err);
    return res.status(500).json({ error: err.message });
  }
};
