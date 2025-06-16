// api/courseforge.js
const OpenAI = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // Allow CORS on actual requests
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    const { topic, audience, format, level } = req.body;
    if (!topic || !audience || !format || !level) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You create high-ticket online courses…" },
        {
          role: "user",
          content: `Topic: ${topic}\nAudience: ${audience}\nFormat: ${format}\nLevel: ${level}`
        }
      ]
    });
    const content = chat.choices?.[0]?.message?.content || "";
    return res.status(200).json({ course: content });
  } catch (err) {
    console.error("courseforge error:", err);
    return res.status(500).json({ error: err.message });
  }
};
