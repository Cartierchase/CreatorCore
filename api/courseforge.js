const Redis   = require("ioredis");
const redis   = new Redis(process.env.REDIS_REST_URL,{token:process.env.REDIS_TOKEN,tls:{}});
const sgMail  = require("@sendgrid/mail"); sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const OpenAI  = require("openai"), openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});

const LIMITS={free:3,creator:100,pro:500,lifetime:1000},ALERT=0.8;

module.exports=async(req,res)=>{
  if(req.method==="OPTIONS"){
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type,X-User-Plan,X-User-Id");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin","*");
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});

  const plan=req.headers[process.env.TRUSTED_PLAN_HEADER.toLowerCase()]||"free";  
  const uid=req.headers["x-user-id"]||"guest";  
  const limit=LIMITS[plan]||LIMITS.free;  
  const key=`u:${uid}:${new Date().toISOString().slice(0,10)}`;  
  const cnt=await redis.incr(key);  
  if(cnt===1){const t=new Date();t.setUTCDate(t.getUTCDate()+1);t.setUTCHours(0,0,0,0);await redis.expire(key,Math.floor((t-new Date())/1000));}  
  if(cnt===Math.floor(limit*ALERT)){sgMail.send({to:process.env.ALERT_EMAIL,from:process.env.FROM_EMAIL,subject:`[Alert] ${uid} at ${ALERT*100}% of ${plan}`,text:`${cnt}/${limit}`}).catch(console.error);}  
  if(cnt>limit) return res.status(429).json({error:"Rate limit exceeded"});

  const {topic,audience,format,level}=req.body;
  if(!topic||!audience||!format||!level)return res.status(400).json({error:"Missing fields"});

  let model="gpt-4o-mini";
  if(plan==="creator")model="gpt-3.5-turbo";
  if(plan==="pro"||plan==="lifetime")model="gpt-4-turbo";

  try{
    const chat=await openai.chat.completions.create({
      model,
      messages:[
        {role:"system",content:"You create high-ticket online courses."},
        {role:"user",content:JSON.stringify({topic,audience,format,level})}
      ]
    });
    const course=chat.choices[0].message.content||"";
    return res.status(200).json({course});
  }catch(e){
    console.error(e);return res.status(500).json({error:e.message||"Server Error"});
  }
};
