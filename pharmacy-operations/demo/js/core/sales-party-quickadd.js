(function(){
  const $=id=>document.getElementById(id);
  const toast=(m,t="success")=>window.MedvikaUI?.toast?.(m,t==="danger"?"error":t);
  const profile=()=>window.MedvikaAuth?.profile||{};
  const pharmacyId=()=>profile().pharmacy_id;
  const userId=()=>profile().user_id||null;

  async function refreshSelect(id,table,labelField,selectedId){
    const pid=pharmacyId(); if(!pid) return;
    const fields=id==="customerId"?"id,"+labelField+",mobile":"id,"+labelField;
    const {data,error}=await supabaseClient.from(table).select(fields).eq("pharmacy_id",pid).eq("is_active",true).order(labelField);
    if(error) throw error;
    const el=$(id); if(!el) return;
    const first=id==="customerId"?'<option value="">Walk-in Customer</option>':'<option value="">Select doctor</option>';
    el.innerHTML=first+(data||[]).map(x=>{
      const label=window.MedvikaUI.safe(x[labelField]||"");
      const mobile=id==="customerId"&&x.mobile?" — "+window.MedvikaUI.safe(x.mobile):"";
      return `<option value="${x.id}">${label}${mobile}</option>`;
    }).join("");
    if(selectedId) el.value=selectedId;
    el.dispatchEvent(new Event("change",{bubbles:true}));
  }

  async function quickCustomer(){
    const name=(prompt("Customer name:")||"").trim(); if(!name) return;
    const mobile=(prompt("Customer mobile (required):")||"").trim();
    if(!mobile){toast("Customer mobile number is required.","danger");return;}
    if(!/^\+?[0-9]{10,15}$/.test(mobile)){toast("Enter a valid mobile number.","danger");return;}
    const pid=pharmacyId(); if(!pid){toast("Pharmacy profile not available.","danger");return;}

    const {data:duplicate,error:dupError}=await supabaseClient
      .from("customers")
      .select("id,full_name,mobile")
      .eq("pharmacy_id",pid)
      .eq("mobile",mobile)
      .eq("is_active",true)
      .limit(1);
    if(dupError){toast(dupError.message,"danger");return;}
    if(duplicate?.length){
      await refreshSelect("customerId","customers","full_name",duplicate[0].id);
      toast(`Mobile already belongs to ${duplicate[0].full_name}. Existing customer selected.`,"warning");
      return;
    }

    const payload={pharmacy_id:pid,full_name:name,mobile,customer_tax_type:"B2C",opening_balance:0,credit_limit:0,loyalty_points:0,is_active:true};
    if(userId()) payload.created_by=userId();
    const {data,error}=await supabaseClient.from("customers").insert(payload).select("id").single();
    if(error){toast(error.message,"danger");return;}
    await refreshSelect("customerId","customers","full_name",data.id);
    if($("patientName")&&!$("patientName").value) $("patientName").value=name;
    if($("patientMobile")&&!$("patientMobile").value) $("patientMobile").value=mobile;
    toast("Customer added with mobile number and selected.");
  }

  async function quickDoctor(){
    const name=(prompt("Doctor name:")||"").trim(); if(!name) return;
    const registration=(prompt("Registration number (recommended):")||"").trim().toUpperCase();
    const mobile=(prompt("Doctor mobile (optional):")||"").trim();
    if(mobile&&!/^\+?[0-9]{10,15}$/.test(mobile)){toast("Enter a valid doctor mobile number.","danger");return;}
    const pid=pharmacyId(); if(!pid){toast("Pharmacy profile not available.","danger");return;}
    if(registration){const {data:dup}=await supabaseClient.from("doctors").select("id").eq("pharmacy_id",pid).ilike("registration_number",registration).limit(1);if(dup?.length){toast("This doctor registration number already exists.","danger");return;}}
    const payload={pharmacy_id:pid,full_name:name,registration_number:registration||null,mobile:mobile||null,is_active:true};
    if(userId()) payload.created_by=userId();
    const {data,error}=await supabaseClient.from("doctors").insert(payload).select("id").single();
    if(error){toast(error.message,"danger");return;}
    await refreshSelect("doctorId","doctors","full_name",data.id);
    toast("Doctor added and selected.");
  }

  function bind(){
    $("quickAddCustomer")?.addEventListener("click",quickCustomer);
    $("quickAddDoctor")?.addEventListener("click",quickDoctor);
    $("customerId")?.addEventListener("change",async()=>{
      const id=$("customerId")?.value; if(!id) return;
      const {data}=await supabaseClient.from("customers").select("full_name,mobile").eq("id",id).eq("pharmacy_id",pharmacyId()).maybeSingle();
      if(data){if($("patientName")&&!$("patientName").value) $("patientName").value=data.full_name||"";if($("patientMobile")&&!$("patientMobile").value) $("patientMobile").value=data.mobile||"";}
    });
  }

  const observer=new MutationObserver(()=>{if($("salesForm")&&$("quickAddCustomer")&&!$("quickAddCustomer").dataset.bound){$("quickAddCustomer").dataset.bound="1";bind();}});
  observer.observe(document.documentElement,{childList:true,subtree:true});

  document.addEventListener("submit",event=>{
    if(event.target?.id!=="salesForm") return;
    const alert=$("complianceSaleAlert");
    const regulated=!!alert&&alert.textContent.trim()!==""&&!/no compliance|not required/i.test(alert.textContent);
    if(!regulated) return;
    const mobile=($("patientMobile")?.value||"").trim();
    if(!mobile||!/^\+?[0-9]{10,15}$/.test(mobile)){
      event.preventDefault();event.stopImmediatePropagation();
      toast("Patient mobile/contact is required for a regulated medicine sale.","danger");
      $("patientMobile")?.focus();
    }
  },true);
})();