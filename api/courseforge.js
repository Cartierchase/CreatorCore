// api/courseforge.js
const { OpenAI } = require("openai");
const Redis      = require("ioredis");
const PDFDocument= require("pdfkit");
const getStream  = require("get-stream");

let redis;
try {
  redis = new Redis(process.env.REDIS_REST_URL, { token:process.env.REDIS_TOKEN, tls:{} });
} catch { redis = null; }

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseOptions: { maxRetriesPerRequest:2 }
});

module.exports = async (req, res) => {
  if(req.method==="OPTIONS"){
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type,X-User-Plan,X-User-Id");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});

  const { topic,audience,format,level } = req.body||{};
  if(![topic,audience,format,level].every(v=>typeof v==="string"&&v.trim())){
    return res.status(400).json({error:"Missing or invalid fields"});
  }

  // plan/dev logic omitted for brevity…

  const system=`
You are a million-dollar life coach. Generate a complete, ready-to-sell course package with:
1) Title & Subtitle
2) Sales Page Blurb
3) Modules & Lessons
4) Workbook exercises per lesson
5) Downloadable resources list
6) CTA & Next Steps
Return JSON: { "courseMarkdown":"…", "pdfBase64":"… (base64 PDF)" }`.trim();

  try {
    const chat=await openai.chat.completions.create({
      model:"gpt-4-turbo",
      messages:[
        {role:"system",content:system},
        {role:"user",content:JSON.stringify({topic,audience,format,level})}
      ]
    });
    const courseMarkdown=chat.choices[0].message.content;

    // generate PDF
    const doc=new PDFDocument();
    doc.fontSize(20).text(topic, {align:"center"}).moveDown();
    doc.fontSize(12).text(courseMarkdown);
    doc.end();
    const pdfBuffer=await getStream.buffer(doc);
    const pdfBase64=pdfBuffer.toString("base64");

    return res.status(200).json({ courseMarkdown, pdfBase64 });
  } catch(err){
    console.error("courseforge error:",err);
    return res.status(500).json({ error:err.message||"Server error" });
  }
};
