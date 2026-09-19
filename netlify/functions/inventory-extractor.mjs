const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const clean=(value,max)=>String(value||"").trim().slice(0,max);

export default async function handler(request){
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  const apiKey=process.env.GEMINI_API_KEY;
  if(!apiKey)return json({error:"Netlify Gemini secret is not configured."},503);

  let body;
  try{body=await request.json()}catch{return json({error:"Invalid extraction request."},400)}
  const file=body.file||{},settings=body.settings||{};
  const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
  if(!file.data||!file.name||!allowed.has(file.mimeType))return json({error:"Upload a valid JPG, PNG, WEBP or PDF file."},400);
  if(String(file.data).length>8_000_000)return json({error:"This file is too large for online extraction. Keep it below 6 MB."},413);

  const schema={type:"object",properties:{rows:{type:"array",items:{type:"object",properties:{
    source_file:{type:"string"},source_page:{type:"number"},source_row:{type:"number"},brand_name_raw:{type:"string"},
    generic_name:{type:"string"},manufacturer:{type:"string"},dosage_form:{type:"string"},pack_size:{type:"string"},
    units_per_pack:{type:"number",nullable:true},stock_as_written:{type:"string"},whole_packs:{type:"number",nullable:true},
    loose_units:{type:"number",nullable:true},effective_pack_quantity:{type:"number",nullable:true},batch_number:{type:"string"},
    expiry_date:{type:"string"},mrp:{type:"number",nullable:true},purchase_rate:{type:"number",nullable:true},
    discount_percent:{type:"number",nullable:true},gst_percent:{type:"number",nullable:true},
    handwritten_total:{type:"number",nullable:true},calculated_total:{type:"number",nullable:true},
    variance:{type:"number",nullable:true},confidence:{type:"string",enum:["HIGH","MEDIUM","LOW"]},review_note:{type:"string"}
  },required:["source_file","source_page","source_row","brand_name_raw","dosage_form","stock_as_written","confidence","review_note"]}}},required:["rows"]};

  const powder=settings.powderRuleEnabled!==false
    ?`For powder and baby-food items, effective quantity is ${Number(settings.powderPercent)||90}% of written container quantity and the review note must state this rule.`
    :"Do not apply a powder percentage automatically.";
  const prompt=`Extract every pharmacy inventory line from this ${settings.outputMode==="purchase_invoice"?"purchase invoice":"stock sheet"}. Source filename: ${clean(file.name,180)}. Preserve written brand spelling. Never invent unclear values: use empty string or null, confidence LOW, and a review_note beginning REVIEW. Use YYYY-MM-DD dates. For tablets/capsules detect strip or box size, keep whole packs and loose units, and calculate effective_pack_quantity as whole_packs + loose_units/units_per_pack. For syrups and liquids count bottles or containers and never apply tablet conversion. ${powder} Use default GST ${Number(settings.defaultGst)||0}% only when GST is absent. Calculate totals and variance only when source values support them.`;
  const media={type:file.mimeType==="application/pdf"?"document":"image",data:file.data,mime_type:file.mimeType};

  const models=["gemini-3.6-flash","gemini-3.5-flash-lite"];
  let lastError={error:"Gemini extraction failed.",upstreamStatus:502,status:502};
  for(const model of models){
    let response;
    try{
      response=await fetch("https://generativelanguage.googleapis.com/v1beta/interactions",{
        method:"POST",
        headers:{"content-type":"application/json","x-goog-api-key":apiKey},
        body:JSON.stringify({model,input:[{type:"text",text:prompt},media],response_format:{type:"text",mime_type:"application/json",schema},generation_config:{thinking_level:"low"},store:false})
      });
    }catch{
      lastError={error:"Gemini could not be reached. Please retry this file.",upstreamStatus:502,status:502};
      continue;
    }
    const responseText=await response.text();
    let result={};
    try{result=responseText?JSON.parse(responseText):{}}catch{
      lastError={error:`Gemini returned an unreadable response (HTTP ${response.status}). Please retry.`,upstreamStatus:response.status,status:502};
      continue;
    }
    if(!response.ok){
      const upstreamStatus=response.status;
      const detail=result?.error?.message||result?.message||result?.error?.details?.[0]?.reason||`Gemini extraction failed (HTTP ${upstreamStatus}).`;
      const status=[400,401,403,404,408,429,500,502,503,504].includes(upstreamStatus)?upstreamStatus:502;
      console.error("Gemini extraction failed",{model,upstreamStatus,detail:clean(detail,300)});
      lastError={error:clean(detail,500),upstreamStatus,status};
      if([408,429,500,502,503,504].includes(upstreamStatus))continue;
      return json({error:lastError.error,upstreamStatus},status);
    }
    try{
      const modelStep=[...(result.steps||[])].reverse().find(step=>step.type==="model_output");
      const output=modelStep?.content?.find(part=>part.type==="text")?.text;
      const parsed=JSON.parse(output);
      return json({rows:Array.isArray(parsed.rows)?parsed.rows:[],model});
    }catch{
      lastError={error:"Gemini returned an invalid result. Please retry.",upstreamStatus:502,status:502};
    }
  }
  return json({error:lastError.error,upstreamStatus:lastError.upstreamStatus},lastError.status);
}
