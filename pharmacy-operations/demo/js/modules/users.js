window.initUsersModule=async function(){
  const UI=window.MedvikaUI,$=id=>document.getElementById(id);
  const staffBody=document.querySelector("#staffTable tbody");
  const inviteBody=document.querySelector("#inviteTable tbody");
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);
  let staff=[],invitations=[],currentUserId=null,currentUserRole=null;
  const roles=["super_admin","pharmacy_admin","pharmacist","inventory_staff","cashier","viewer"];

  function formatRole(role){
    if(role==="viewer")return "Management Viewer";
    return String(role||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
  }

  function inviteUrl(token){
    const url=new URL("accept-invite.html",window.location.href);
    url.hash="";
    url.search="";
    url.searchParams.set("token",token);
    return url.toString();
  }

  async function loadCurrentUser(){
    const {data:{user},error}=await supabaseClient.auth.getUser();
    if(error)throw error;
    if(!user)throw new Error("User is not authenticated.");
    currentUserId=user.id;
    currentUserRole=window.MedvikaAuth.profile?.role||null;
  }

  async function loadStaff(){
    const {data,error}=await supabaseClient.rpc("list_pharmacy_staff");
    if(error)throw error;
    staff=data||[];
    renderStaff();updateSummary();
  }

  async function loadInvitations(){
    const {data,error}=await supabaseClient.from("staff_invitations").select("*").order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    invitations=data||[];
    renderInvitations();updateSummary();
  }

  function roleOptionsForUser(user){
    if(user.role==="super_admin")return '<option value="super_admin" selected>Super Admin</option>';
    return roles.filter(r=>r!=="super_admin").map(r=>`<option value="${r}" ${user.role===r?"selected":""}>${formatRole(r)}</option>`).join("");
  }

  function filteredStaff(){
    const s=$("staffSearch").value.trim().toLowerCase(),role=$("staffRoleFilter").value,status=$("staffStatusFilter").value;
    return staff.filter(user=>{
      const text=[user.full_name,user.email,formatRole(user.role)].filter(Boolean).join(" ").toLowerCase();
      return(!s||text.includes(s))&&(role==="ALL"||user.role===role)&&(status==="ALL"||(status==="ACTIVE"&&user.is_active===true)||(status==="INACTIVE"&&user.is_active!==true));
    });
  }

  function renderStaff(){
    const rows=filteredStaff();
    staffBody.innerHTML=rows.length?rows.map(user=>{
      const isSuper=user.role==="super_admin",isOwn=user.user_id===currentUserId;
      return `<tr>
        <td><b>${UI.safe(user.full_name||"—")}</b>${isOwn?"<small>Current account</small>":""}</td>
        <td>${UI.safe(user.email||"—")}</td>
        <td><select class="staff-role" data-id="${user.user_id}" ${isSuper?"disabled":""}>${roleOptionsForUser(user)}</select></td>
        <td><span class="badge ${user.is_active?"badge-active":"badge-inactive"}">${user.is_active?"Active":"Inactive"}</span></td>
        <td>${user.created_at?new Date(user.created_at).toLocaleDateString():"—"}</td>
        <td>${isSuper?'<span class="badge badge-owner">Primary System Owner</span>':`<button class="permissions-button" data-id="${user.user_id}" type="button">Manage Permissions</button>`}</td>
        <td>${isSuper?'<span class="badge badge-owner">Protected</span>':`<div class="actions"><button class="save-access" data-id="${user.user_id}" type="button">Save Role</button><button class="${user.is_active?"deactivate":"restore"} toggle-access" data-id="${user.user_id}" data-active="${user.is_active}" type="button" ${isOwn?"disabled":""}>${isOwn?"Own Account":user.is_active?"Deactivate":"Restore"}</button></div>`}</td>
      </tr>`;
    }).join(""):'<tr><td colspan="7" class="empty">No matching staff.</td></tr>';

    document.querySelectorAll(".save-access").forEach(button=>button.onclick=async()=>{
      const user=staff.find(x=>x.user_id===button.dataset.id);
      const select=document.querySelector(`.staff-role[data-id="${button.dataset.id}"]`);
      if(user&&select)await updateAccess(user.user_id,select.value,user.is_active);
    });

    document.querySelectorAll(".toggle-access").forEach(button=>button.onclick=async()=>{
      if(button.disabled)return;
      const user=staff.find(x=>x.user_id===button.dataset.id);
      const select=document.querySelector(`.staff-role[data-id="${button.dataset.id}"]`);
      if(user&&select)await updateAccess(user.user_id,select.value,button.dataset.active!=="true");
    });

    document.querySelectorAll(".permissions-button").forEach(button=>button.onclick=()=>{
      sessionStorage.setItem("medvika_permissions_user_id",button.dataset.id);
      window.MedvikaRouter.navigate("permissions");
    });
  }

  async function updateAccess(userId,role,isActive){
    if(role==="super_admin"){toast("Super Admin cannot be assigned from this page.","danger");return}
    if(userId===currentUserId&&!isActive){toast("You cannot deactivate your own account.","warning");return}
    const target=staff.find(x=>x.user_id===userId);
    if(currentUserRole==="pharmacy_admin"&&target?.role==="pharmacy_admin"&&userId!==currentUserId){
      toast("Only Super Admin should modify another Pharmacy Admin.","warning");return
    }
    if(!window.confirm(`Update this user to "${formatRole(role)}" and status "${isActive?"Active":"Inactive"}"?`))return;
    const {error}=await supabaseClient.rpc("update_staff_access",{p_user_id:userId,p_role:role,p_is_active:isActive});
    if(error){toast(error.message,"danger");return}
    toast("Staff access updated.");await loadStaff();
  }

  function renderInvitations(){
    const showOld=$("showOldInvites").checked;
    const rows=invitations.filter(i=>showOld||i.invitation_status==="pending");
    inviteBody.innerHTML=rows.length?rows.map(invite=>{
      const url=inviteUrl(invite.invite_token);
      return `<tr>
        <td>${UI.safe(invite.email||"—")}</td><td>${UI.safe(invite.full_name||"—")}</td><td>${UI.safe(formatRole(invite.role))}</td><td>${UI.safe(invite.invitation_status||"—")}</td><td>${invite.expires_at?new Date(invite.expires_at).toLocaleString():"—"}</td>
        <td>${invite.invitation_status==="pending"?`<button class="copy-link" data-url="${UI.safe(url)}" type="button">Copy Link</button>`:"—"}</td>
        <td>${invite.invitation_status==="pending"?`<button class="cancel-invite deactivate" data-id="${invite.id}" type="button">Cancel</button>`:"—"}</td>
      </tr>`;
    }).join(""):'<tr><td colspan="7" class="empty">No invitations.</td></tr>';

    document.querySelectorAll(".copy-link").forEach(button=>button.onclick=async()=>{
      try{await navigator.clipboard.writeText(button.dataset.url);toast("Invitation link copied.")}
      catch{window.prompt("Copy invitation link:",button.dataset.url)}
    });
    document.querySelectorAll(".cancel-invite").forEach(button=>button.onclick=async()=>{
      if(!window.confirm("Cancel this pending invitation?"))return;
      const {error}=await supabaseClient.rpc("cancel_staff_invitation",{p_invitation_id:button.dataset.id});
      if(error){toast(error.message,"danger");return}
      toast("Invitation cancelled.");await loadInvitations();
    });
  }

  async function createInvitation(event){
    event.preventDefault();
    const button=$("createInviteButton");button.disabled=true;button.textContent="Creating...";
    try{
      const role=$("inviteRole").value;
      const {data,error}=await supabaseClient.rpc("create_staff_invitation",{p_email:$("inviteEmail").value.trim(),p_full_name:$("inviteName").value.trim()||null,p_role:role});
      if(error)throw error;
      await loadInvitations();
      const invite=invitations.find(x=>x.id===data);
      if(!invite)throw new Error("Invitation created but invitation link could not be loaded.");
      const url=inviteUrl(invite.invite_token);
      $("inviteLinkBox").innerHTML=`<div class="invite-link-box"><b>Invitation created successfully.</b><input id="newInviteUrl" value="${UI.safe(url)}" readonly><button id="copyNewInviteLink" type="button">Copy Invitation Link</button></div>`;
      $("copyNewInviteLink").onclick=async()=>{try{await navigator.clipboard.writeText(url);toast("Invitation link copied.")}catch{window.prompt("Copy invitation link:",url)}};
      $("inviteForm").reset();$("inviteRole").value="pharmacist";toast("Staff invitation created.");
    }catch(error){toast(error.message,"danger")}
    finally{button.disabled=false;button.textContent="Create Invitation"}
  }

  function updateSummary(){
    $("staffTotalCount").textContent=staff.length;
    $("staffActiveCount").textContent=staff.filter(x=>x.is_active===true).length;
    $("staffInactiveCount").textContent=staff.filter(x=>x.is_active!==true).length;
    $("staffPendingInviteCount").textContent=invitations.filter(x=>x.invitation_status==="pending").length;
  }

  $("staffSearch").oninput=renderStaff;$("staffRoleFilter").onchange=renderStaff;$("staffStatusFilter").onchange=renderStaff;
  $("showOldInvites").onchange=renderInvitations;$("inviteForm").onsubmit=createInvitation;
  $("refreshUsersButton").onclick=async()=>{try{await Promise.all([loadStaff(),loadInvitations()])}catch(e){toast(e.message,"danger")}};

  try{
    await loadCurrentUser();
    await Promise.all([loadStaff(),loadInvitations()]);
    window.MedvikaPermissions?.applyActionGuards();
  }catch(error){
    toast("User Management could not load: "+error.message,"danger");
  }
};