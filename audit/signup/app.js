const URL="https://etevzodzxhsdwidtrmwv.supabase.co",KEY="sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";
const sb=supabase.createClient(URL,KEY);const $=id=>document.getElementById(id);
async function loadPlans(){const {data,error}=await sb.from("medvika_audit_plans").select("*").eq("active",true).order("amount");
if(error){$("msg").textContent=error.message;return;} $("plans").innerHTML=(data||[]).map(p=>`<div class="plan"><h3>${p.plan_name}</h3><strong>₹${Number(p.amount).toLocaleString("en-IN")}</strong><p class="muted">${p.validity_days} days • ${p.sku_limit.toLocaleString("en-IN")} SKUs • ${p.team_limit} teams • ${p.audit_limit} audit(s)</p></div>`).join("");
$("planCode").innerHTML=(data||[]).map(p=>`<option value="${p.plan_code}">${p.plan_name} — ₹${p.amount}</option>`).join("");}
$("signupForm").addEventListener("submit",async e=>{e.preventDefault();$("msg").textContent="Submitting...";
const {data,error}=await sb.rpc("medvika_audit_submit_signup",{p_full_name:$("fullName").value,p_business_name:$("businessName").value,p_email:$("email").value,p_mobile:$("mobile").value,p_city:$("city").value,p_state:$("state").value,p_plan_code:$("planCode").value});
if(error){$("msg").textContent=error.message;return;} sessionStorage.setItem("medvika_signup_id",data);location.href="../payment/?signup="+encodeURIComponent(data);});loadPlans();