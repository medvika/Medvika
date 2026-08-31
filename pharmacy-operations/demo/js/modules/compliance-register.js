window.initComplianceRegisterModule=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id),pid=window.MedvikaAuth?.profile?.pharmacy_id;
 const type=document.querySelector(".comp-page")?.dataset.complianceType;let rows=[],visible=[];
 function local(d){const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10)}
 function render(){
   const f=$("regFrom").value,t=$("regTo").value,q=$("regSearch").value.trim().toLowerCase();
   visible=rows.filter(x=>{
     const d=String(x.captured_at||"").slice(0,10);
     const txt=`${x.invoice_number} ${x.drug_name} ${x.generic_key} ${x.patient_name} ${x.prescriber_name} ${x.prescription_reference}`.toLowerCase();
     return(!f||d>=f)&&(!t||d<=t)&&(!q||txt.includes(q))
   });
   $("regCountCard").textContent=visible.length;
   $("regMissingPatient").textContent=visible.filter(x=>!x.patient_name).length;
   $("regMissingDoctor").textContent=visible.filter(x=>!x.prescriber_name).length;
   $("regMissingRx").textContent=visible.filter(x=>!x.prescription_reference).length;
   $("regBody").innerHTML=visible.map(x=>`<tr>
     <td>${UI.safe(String(x.captured_at||"").slice(0,10))}</td>
     <td>${UI.safe(x.invoice_number||x.sales_invoice_id||"—")}</td>
     <td>${UI.safe(x.drug_name||"—")}</td>
     <td>${UI.safe(x.generic_key||"—")}</td>
     <td>${UI.safe(x.quantity??"—")}</td>
     <td>${UI.safe(x.patient_name||"MISSING")}</td>
     <td>${UI.safe(x.patient_age??"MISSING")}</td>
     <td>${UI.safe(x.patient_address||"—")}</td>
     <td>${UI.safe(x.prescriber_name||"MISSING")}</td>
     <td>${UI.safe(x.prescriber_address||"—")}</td>
     <td>${UI.safe(x.prescription_reference||"MISSING")}</td>
     <td>${UI.safe(x.batch_number||"—")}</td>
     <td>${UI.safe(x.expiry_date||"—")}</td>
   </tr>`).join("")||'<tr><td colspan="13">No records.</td></tr>';
 }
 async function load(){
   let q=supabaseClient.from("compliance_sale_records").select("*").eq("pharmacy_id",pid);
   if(type==="CONTROLLED")q=q.in("compliance_type",["CONTROLLED","SCHEDULE_X"]);
   else q=q.eq("compliance_type",type);
   const{data,error}=await q.order("captured_at",{ascending:false}).limit(50000);
   if(error)throw error;rows=data||[];render()
 }
 function csv(){
   const h=["Date","Invoice","Drug","Generic","Qty","Patient","Age","Patient Address","Prescriber","Prescriber Address","Prescription Ref","Batch","Expiry"];
   const d=visible.map(x=>[String(x.captured_at||"").slice(0,10),x.invoice_number||x.sales_invoice_id,x.drug_name,x.generic_key,x.quantity,x.patient_name,x.patient_age,x.patient_address,x.prescriber_name,x.prescriber_address,x.prescription_reference,x.batch_number,x.expiry_date]);
   const esc=v=>`"${String(v??"").replaceAll('"','""')}"`,txt=[h,...d].map(r=>r.map(esc).join(",")).join("\n"),a=document.createElement("a"),u=URL.createObjectURL(new Blob([txt],{type:"text/csv"}));
   a.href=u;a.download=`Medvika_${type}_Register.csv`;a.click();URL.revokeObjectURL(u)
 }
 const d=new Date();$("regTo").value=local(d);$("regFrom").value=local(new Date(d.getFullYear(),d.getMonth(),1));
 $("regFrom").onchange=render;$("regTo").onchange=render;$("regSearch").oninput=render;
 $("regRefresh").onclick=load;$("regPrint").onclick=()=>window.print();$("regCsv").onclick=csv;
 try{await load()}catch(e){UI.toast(e.message,"error")}
};