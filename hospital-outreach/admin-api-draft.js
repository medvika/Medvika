// Draft-only Medvika hospital campaign API module.
// This file is NOT connected to production Worker. It performs no email sending.
// Requires secure Worker secret OUTREACH_ADMIN_TOKEN and Supabase service-role secret.
// Bind into an admin-only Worker route only after review and secret setup.
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
const emailOk=s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const allowedOrigin=new Set(["https://medvika.co.in","https://www.medvika.co.in"]);
function constantTimeEquals(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export async function hospitalOutreachApi(request,env){
 if(!env.OUTREACH_ADMIN_TOKEN||!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return reply({error:"Outreach not configured"},503);
 const origin=request.headers.get("origin");
 if(origin&&!allowedOrigin.has(origin))return reply({error:"Forbidden origin"},403);
 if(request.headers.get("authorization")?.startsWith("Bearer ")!==true)return reply({error:"Unauthorized"},401);
 const token=request.headers.get("authorization").slice(7);
 if(!constantTimeEquals(token,env.OUTREACH_ADMIN_TOKEN))return reply({error:"Unauthorized"},401);
 const url=new URL(request.url);
 if(request.method==="GET"&&url.pathname.endsWith("/contacts")){
  const res=await fetch(env.SUPABASE_URL+"/rest/v1/medvika_outreach_contacts?select=id,hospital_name,email,city,status,created_at&order=created_at.desc&limit=500",{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY}});
  if(!res.ok)return reply({error:"Database query failed"},502);
  return reply({contacts:await res.json(),sending_enabled:false});
 }
 if(request.method!=="POST"||!url.pathname.endsWith("/import"))return reply({error:"Not found"},404);
 if(!request.headers.get("content-type")?.includes("application/json"))return reply({error:"JSON required"},415);
 const raw=await request.text();if(raw.length>350000)return reply({error:"Import too large"},413);
 let body;try{body=JSON.parse(raw);}catch{return reply({error:"Invalid JSON"},400);}
 if(!Array.isArray(body.contacts)||body.contacts.length>500)return reply({error:"Import up to 500 contacts"},400);
 const dedup=new Set(),records=[];
 for(const c of body.contacts){
  const email=String(c.email||"").trim().toLowerCase(),hospital_name=String(c.hospital_name||"").trim().slice(0,180),city=String(c.city||"").trim().slice(0,100);
  if(!emailOk(email)||hospital_name.length<2||email.length>254)return reply({error:"Invalid contact found; import aborted"},400);
  if(dedup.has(email))continue;dedup.add(email);
  records.push({email,hospital_name,city,status:"unapproved",campaign_name:"UP Hospitals Website Outreach",source:"hospital list upload"});
 }
 if(!records.length)return reply({error:"No valid contacts"},400);
 const res=await fetch(env.SUPABASE_URL+"/rest/v1/medvika_outreach_contacts?on_conflict=campaign_name%2Cemail",{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"content-type":"application/json",Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(records)});
 if(!res.ok)return reply({error:"CRM import failed"},502);
 return reply({ok:true,received:body.contacts.length,unique:records.length,sending_enabled:false});
}
