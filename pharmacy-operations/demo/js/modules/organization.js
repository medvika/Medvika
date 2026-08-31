window.initOrganizationModule=async function(){
 const UI=window.MedvikaUI,$=id=>document.getElementById(id),profile=window.MedvikaAuth?.profile||{};
 let orgId=profile.organization_id||null;

 function go(route){
   if(window.MedvikaRouter?.navigate)window.MedvikaRouter.navigate(route);
   else location.hash=route;
 }

 const createButton=$("orgCreateNew");
 if(createButton && profile.role==="super_admin"){
   createButton.hidden=false;
   createButton.onclick=()=>go("new-organization");
 }

 async function ensureOrg(){
   if(orgId)return;
   const{data,error}=await supabaseClient
     .from("pharmacies")
     .select("organization_id")
     .eq("id",profile.pharmacy_id)
     .single();
   if(error)throw error;
   orgId=data?.organization_id||null
 }

 async function load(){
   await ensureOrg();
   if(!orgId)throw new Error("Organization is not configured.");
   const{data,error}=await supabaseClient
     .from("organizations")
     .select("*")
     .eq("id",orgId)
     .single();
   if(error)throw error;
   $("orgName").value=data.name||"";
   $("orgLegalName").value=data.legal_name||"";
   $("orgCode").value=data.code||"";
   $("orgPhone").value=data.phone||"";
   $("orgEmail").value=data.email||""
 }

 async function save(){
   const payload={
     name:$("orgName").value.trim(),
     legal_name:$("orgLegalName").value.trim()||null,
     code:$("orgCode").value.trim().toUpperCase()||null,
     phone:$("orgPhone").value.trim()||null,
     email:$("orgEmail").value.trim()||null,
     updated_at:new Date().toISOString()
   };

   if(!payload.name)
     return UI.toast("Organization name is required.","warning");

   const{error}=await supabaseClient
     .from("organizations")
     .update(payload)
     .eq("id",orgId);

   if(error)return UI.toast(error.message,"error");
   UI.toast("Organization saved.")
 }

 $("orgSave").onclick=save;

 try{await load()}
 catch(e){UI.toast(e.message,"error")}
};