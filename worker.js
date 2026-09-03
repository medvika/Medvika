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
export default{async fetch(request,env){const u=new URL(request.url);if(request.method==="POST"&&u.pathname==="/api/razorpay/order")return createOrder(request,env);if(request.method==="POST"&&u.pathname==="/api/razorpay/verify")return verifyPayment(request,env);return env.ASSETS.fetch(request);}};