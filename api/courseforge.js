// api/courseforge.js
const { OpenAI } = require("openai");

// Init OpenAI (no PDFKit, no Redis)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseOptions: { maxRetriesPerRequest: 2 }
});

module.exports = async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  // Allow CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validate
  const { topic, audience, format, level } = req.body || {};
  if (![topic,audience,format,level].every(v => typeof v === "string" && v.trim())) {
    return res.status(400).json({ error: "Missing fields" });
  }

  // Build prompt
  const system = `
You are a million-dollar life coach. 
Generate a complete, ready-to-sell course package with:
1) Title & Subtitle
2) Sales Page Blurb
3) Modules & Lessons
4) Workbook Exercises per Lesson
5) Downloadable Resources List
6) CTA & Next Steps
Return JSON: { "courseMarkdown":"..." }`.trim();

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role:"system", content: system },
        { role:"user",   content: JSON.stringify({ topic, audience, format, level }) }
      ]
    });
    const courseMarkdown = chat.choices[0].message.content;
    return res.status(200).json({ courseMarkdown });
  } catch (e) {
    console.error("courseforge error:", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
};
