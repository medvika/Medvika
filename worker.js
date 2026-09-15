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
 const schema={type:"OBJECT",properties:{rows:{type:"ARRAY",items:{type:"OBJECT",properties:{source_file:{type:"STRING"},source_page:{type:"NUMBER"},source_row:{type:"NUMBER"},brand_name_raw:{type:"STRING"},generic_name:{type:"STRING"},manufacturer:{type:"STRING"},dosage_form:{type:"STRING"},pack_size:{type:"STRING"},units_per_pack:{type:"NUMBER",nullable:true},stock_as_written:{type:"STRING"},whole_packs:{type:"NUMBER",nullable:true},loose_units:{type:"NUMBER",nullable:true},effective_pack_quantity:{type:"NUMBER",nullable:true},batch_number:{type:"STRING"},expiry_date:{type:"STRING"},mrp:{type:"NUMBER",nullable:true},purchase_rate:{type:"NUMBER",nullable:true},discount_percent:{type:"NUMBER",nullable:true},gst_percent:{type:"NUMBER",nullable:true},handwritten_total:{type:"NUMBER",nullable:true},calculated_total:{type:"NUMBER",nullable:true},variance:{type:"NUMBER",nullable:true},confidence:{type:"STRING",enum:["HIGH","MEDIUM","LOW"]},review_note:{type:"STRING"}},required:["source_file","source_page","source_row","brand_name_raw","dosage_form","stock_as_written","confidence","review_note"]}}},required:["rows"]};
 const powder=settings.powderRuleEnabled!==false?`For powder and baby-food items, effective quantity is ${Number(settings.powderPercent)||90}% of written container quantity and the review note must state this rule.`:"Do not apply a powder percentage automatically.";
 const prompt=`Extract every pharmacy inventory line from this ${settings.outputMode==="purchase_invoice"?"purchase invoice":"stock sheet"}. Source filename: ${clean(file.name,180)}. Preserve written brand spelling. Never invent unclear values: use empty string or null, confidence LOW, and a review_note beginning REVIEW. Use YYYY-MM-DD dates. For tablets/capsules detect strip or box size, keep whole packs and loose units, and calculate effective_pack_quantity as whole_packs + loose_units/units_per_pack. For syrups and liquids count bottles or containers and never apply tablet conversion. ${powder} Use default GST ${Number(settings.defaultGst)||0}% only when GST is absent. Calculate totals and variance only when source values support them.`;
 const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",{method:"POST",headers:{"content-type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:file.mimeType,data:file.data}}]}],generationConfig:{responseMimeType:"application/json",responseJsonSchema:schema}})});
 const result=await response.json();
 if(!response.ok)return json({error:result?.error?.message||"Gemini extraction failed."},502);
 try{const text=result.candidates?.[0]?.content?.parts?.[0]?.text;const parsed=JSON.parse(text);return json({rows:Array.isArray(parsed.rows)?parsed.rows:[]})}catch{return json({error:"Gemini returned an invalid result. Please retry."},502)}
}
export default{async fetch(request,env){const u=new URL(request.url);if(request.method==="POST"&&u.pathname==="/api/razorpay/order")return createOrder(request,env);if(request.method==="POST"&&u.pathname==="/api/razorpay/verify")return verifyPayment(request,env);if(request.method==="POST"&&u.pathname==="/api/inventory-extractor")return extractInventory(request,env);return env.ASSETS.fetch(request);}};
