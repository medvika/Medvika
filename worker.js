const PRICE=49900;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const clean=(v,n)=>String(v||"").trim().slice(0,n);
async function createOrder(request,env){
 if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)return json({error:"Online checkout is being activated."},503);
 let body;try{body=await request.json()}catch{return json({error:"Invalid request."},400)}
 const name=clean(body.name,70),email=clean(body.email,120),phone=clean(body.phone,10);
 if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/[6-9][0-9]{9}/.test(phone))return json({error:"Please enter valid delivery details."},400);
 const receipt="sop_"+Date.now().toString(36);
 const auth=btoa(env.RAZORPAY_KEY_ID+":"+env.RAZORPAY_KEY_SECRET);
 const rp=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{"authorization":"Basic "+auth,"content-type":"application/json"},body:JSON.stringify({amount:PRICE,currency:"INR",receipt,notes:{product:"Medvika Pharmacy SOP Toolkit",customer_name:name,customer_email:email,customer_phone:phone}})});
 const data=await rp.json();if(!rp.ok)return json({error:"Unable to start payment. Please try again."},502);
 return json({orderId:data.id,amount:PRICE,keyId:env.RAZORPAY_KEY_ID});
}
async function hmac(secret,message){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,"0")).join("");}
async function verifyPayment(request,env){
 if(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)return json({error:"Payment verification is not configured."},503);
 let b;try{b=await request.json()}catch{return json({error:"Invalid verification request."},400)}
 const orderId=clean(b.razorpay_order_id,80),paymentId=clean(b.razorpay_payment_id,80),signature=clean(b.razorpay_signature,128);
 if(!orderId||!paymentId||!signature)return json({error:"Missing payment verification details."},400);
 const expected=await hmac(env.RAZORPAY_KEY_SECRET,orderId+"|"+paymentId);
 let mismatch=expected.length!==signature.length;if(!mismatch){let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);mismatch=diff!==0}if(mismatch)return json({error:"Payment signature could not be verified."},400)
 const auth=btoa(env.RAZORPAY_KEY_ID+":"+env.RAZORPAY_KEY_SECRET);
 const rp=await fetch("https://api.razorpay.com/v1/payments/"+encodeURIComponent(paymentId),{headers:{"authorization":"Basic "+auth}});
 const payment=await rp.json();
 if(!rp.ok||payment.order_id!==orderId||payment.amount!==PRICE||payment.currency!=="INR"||!["authorized","captured"].includes(payment.status))return json({error:"Payment details do not match this order."},400);
 return json({verified:true,orderId});
}
async function extractInventory(request,env){
 if(!env.GEMINI_API_KEY)return json({error:"Inventory extraction is being configured."},503);
 let body;try{body=await request.json()}catch{return json({error:"Invalid extraction request."},400)}
 const file=body.file||{},settings=body.settings||{};
 const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
 if(!file.data||!file.name||!allowed.has(file.mimeType))return json({error:"Upload a valid JPG, PNG, WEBP or PDF file."},400);
 if(String(file.data).length>12_000_000)return json({error:"This file is too large. Maximum size is 8 MB."},413);
 const schema={type:"object",properties:{rows:{type:"array",items:{type:"object",properties:{source_file:{type:"string"},source_page:{type:"number"},source_row:{type:"number"},brand_name_raw:{type:"string"},generic_name:{type:"string"},manufacturer:{type:"string"},dosage_form:{type:"string"},pack_size:{type:"string"},units_per_pack:{type:"number",nullable:true},stock_as_written:{type:"string"},whole_packs:{type:"number",nullable:true},loose_units:{type:"number",nullable:true},effective_pack_quantity:{type:"number",nullable:true},batch_number:{type:"string"},expiry_date:{type:"string"},mrp:{type:"number",nullable:true},purchase_rate:{type:"number",nullable:true},discount_percent:{type:"number",nullable:true},gst_percent:{type:"number",nullable:true},handwritten_total:{type:"number",nullable:true},calculated_total:{type:"number",nullable:true},variance:{type:"number",nullable:true},confidence:{type:"string",enum:["HIGH","MEDIUM","LOW"]},review_note:{type:"string"}},required:["source_file","source_page","source_row","brand_name_raw","dosage_form","stock_as_written","confidence","review_note"]}}},required:["rows"]};
 const powder=settings.powderRuleEnabled!==false?`For powder and baby-food items, effective quantity is ${Number(settings.powderPercent)||90}% of written container quantity and the review note must state this rule.`:"Do not apply a powder percentage automatically.";
 const prompt=`Extract every pharmacy inventory line from this ${settings.outputMode==="purchase_invoice"?"purchase invoice":"stock sheet"}. Source filename: ${clean(file.name,180)}. Preserve written brand spelling. Never invent unclear values: use empty string or null, confidence LOW, and a review_note beginning REVIEW. Use YYYY-MM-DD dates. For tablets/capsules detect strip or box size, keep whole packs and loose units, and calculate effective_pack_quantity as whole_packs + loose_units/units_per_pack. For syrups and liquids count bottles or containers and never apply tablet conversion. ${powder} Use default GST ${Number(settings.defaultGst)||0}% only when GST is absent. Calculate totals and variance only when source values support them.`;
 const media={type:file.mimeType==="application/pdf"?"document":"image",data:file.data,mime_type:file.mimeType};
 let response;try{response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({model:"gemini-3.6-flash",input:[{type:"text",text:prompt},media],response_format:{type:"text",mime_type:"application/json",schema},store:false})})}catch{return json({error:"Gemini could not be reached. Please retry this file."},502)}
 const responseText=await response.text();let result={};try{result=responseText?JSON.parse(responseText):{}}catch{return json({error:`Gemini returned an unreadable response (HTTP ${response.status}). Please retry.`},502)}
 if(!response.ok)return json({error:result?.error?.message||`Gemini extraction failed (HTTP ${response.status}).`},502);
 if(!responseText)return json({error:"Gemini returned an empty response. Please retry this file."},502);
 try{const modelStep=[...(result.steps||[])].reverse().find(step=>step.type==="model_output");const text=modelStep?.content?.find(part=>part.type==="text")?.text;const parsed=JSON.parse(text);return json({rows:Array.isArray(parsed.rows)?parsed.rows:[]})}catch{return json({error:"Gemini returned an invalid result. Please retry."},502)}
}
async function proxyInventory(request){try{return await fetch("https://flourishing-caramel-da70f8.netlify.app/.netlify/functions/inventory-extractor",{method:"POST",headers:{"content-type":"application/json"},body:await request.text()})}catch{return json({error:"The extraction service could not be reached. Please retry."},502)}}

async function websiteLead(req,env){
 const origin=req.headers.get("origin");
 if(origin&&!["https://medvika.co.in","https://www.medvika.co.in"].includes(origin))return json({error:"Origin not allowed"},403);
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return json({error:"CRM not configured"},503);
 if(!/application\/json/i.test(req.headers.get("content-type")||""))return json({error:"JSON required"},415);
 let b;try{const raw=await req.text();if(raw.length>6000)return json({error:"Payload too large"},413);b=JSON.parse(raw)}catch{return json({error:"Invalid JSON"},400)}
 if(b.website)return json({ok:true,saved:false});
 const name=clean(b.name,100),mobile=clean(b.phone,25).replace(/\D/g,""),email=clean(b.email,150),service=clean(b.service,150),detail=clean(b.requirement,1800),type=clean(b.type,40),date=clean(b.preferred_date,12);
 if(!["request_a_quote","book_consultation"].includes(type)||name.length<2||! /^(91)?[6-9]\d{9}$/.test(mobile)||!service)return json({error:"Valid name, phone and service required"},400);
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"Invalid email"},400);
 if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:"Invalid date"},400);
 const base=String(env.SUPABASE_URL).replace(/\/$/,"");
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base))return json({error:"CRM configuration invalid"},503);
 const record={contact_name:name,phone:mobile.slice(-10),email:email||null,service_interest:service,requirement:detail||null,source:"website",source_detail:type,notes:date?"Preferred date (not confirmed): "+date:null};
 try{
 const response=await fetch(base+"/rest/v1/medvika_leads",{method:"POST",headers:{"apikey":env.SUPABASE_SERVICE_ROLE_KEY,"authorization":"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"content-type":"application/json","prefer":"return=minimal"},body:JSON.stringify(record)});
 if(!response.ok)return json({error:"CRM save failed"},502);
 return json({ok:true,saved:true});
 }catch{return json({error:"CRM unavailable"},502)}
}

export default{async fetch(request,env){const u=new URL(request.url);if(request.method==="POST"&&u.pathname==="/api/leads")return websiteLead(request,env);if(request.method==="POST"&&u.pathname==="/api/razorpay/order")return createOrder(request,env);if(request.method==="POST"&&u.pathname==="/api/razorpay/verify")return verifyPayment(request,env);if(request.method==="POST"&&u.pathname==="/api/inventory-extractor")return proxyInventory(request);return env.ASSETS.fetch(request);}};
