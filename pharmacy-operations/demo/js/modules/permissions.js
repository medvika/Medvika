window.initPermissionsModule=async function(){
  const UI=window.MedvikaUI;
  const $=id=>document.getElementById(id);
  const roleBody=document.querySelector("#rolePermissionTable tbody");
  const userBody=document.querySelector("#userOverrideTable tbody");
  const toast=(m,t="success")=>UI.toast(m,t==="danger"?"error":t);

  const roles=[
    "pharmacy_admin",
    "pharmacist",
    "inventory_staff",
    "cashier",
    "viewer"
  ];

  let permissions=[];
  let rolePermissions=[];
  let staff=[];
  let overrides=[];

  async function load(){
    const pid=window.MedvikaAuth.profile?.pharmacy_id;

    const [p,r,u,o]=await Promise.all([
      supabaseClient
        .from("erp_permissions")
        .select("*")
        .eq("is_active",true)
        .order("permission_group")
        .order("permission_key"),

      supabaseClient
        .from("erp_role_permissions")
        .select("*"),

      supabaseClient
  .from("user_profiles")
  .select("user_id,full_name,role,is_active")
  .eq("pharmacy_id",pid)
  .eq("is_active",true),

      supabaseClient
        .from("erp_user_permission_overrides")
        .select("*")
        .eq("pharmacy_id",pid)
    ]);

    const error=[p,r,u,o].find(x=>x.error)?.error;
    if(error)throw error;

    permissions=p.data||[];
    rolePermissions=r.data||[];
    staff=(u.data||[]).filter(x=>x.role!=="super_admin");
    overrides=o.data||[];

    renderRoleMatrix();
    renderUserSelect();
  }

  function allowed(role,key){
    return rolePermissions.find(
      x=>x.role===role&&x.permission_key===key
    )?.is_allowed===true;
  }

  function renderRoleMatrix(){
    let lastGroup=null;
    const rows=[];

    permissions.forEach(permission=>{
      if(permission.permission_group!==lastGroup){
        rows.push(`
          <tr class="permission-group">
            <td colspan="6">${UI.safe(permission.permission_group)}</td>
          </tr>
        `);

        lastGroup=permission.permission_group;
      }

      rows.push(`
        <tr>
          <td class="permission-title">
            <b>${UI.safe(permission.permission_label)}</b>
            <small>
              ${UI.safe(permission.permission_key)}
              — ${UI.safe(permission.description||"")}
            </small>
          </td>

          ${roles.map(role=>`
            <td>
              <input
                type="checkbox"
                class="permission-toggle"
                data-role="${role}"
                data-key="${permission.permission_key}"
                ${allowed(role,permission.permission_key)?"checked":""}
              >
            </td>
          `).join("")}
        </tr>
      `);
    });

    roleBody.innerHTML=rows.join("");

    document.querySelectorAll(".permission-toggle").forEach(toggle=>{
      toggle.onchange=async()=>{
        const {error}=await supabaseClient.rpc(
          "update_role_permission_v2",
          {
            p_role:toggle.dataset.role,
            p_permission_key:toggle.dataset.key,
            p_is_allowed:toggle.checked
          }
        );

        if(error){
          toggle.checked=!toggle.checked;
          toast(error.message,"danger");
          return;
        }

        const existing=rolePermissions.find(
          x=>
            x.role===toggle.dataset.role&&
            x.permission_key===toggle.dataset.key
        );

        if(existing){
          existing.is_allowed=toggle.checked;
        }else{
          rolePermissions.push({
            role:toggle.dataset.role,
            permission_key:toggle.dataset.key,
            is_allowed:toggle.checked
          });
        }

        toast("Role permission updated.");
      };
    });
  }

  function renderUserSelect(){
    $("permissionUserSelect").innerHTML=
      '<option value="">Select user</option>'+
      staff.map(user=>`
        <option value="${user.user_id}">
          ${UI.safe(user.full_name||"User")}
          — ${UI.safe(user.role==="viewer"?"Management Viewer":user.role)}
        </option>
      `).join("");
  }

  function renderUserOverrides(){
    const userId=$("permissionUserSelect").value;
    const user=staff.find(x=>x.user_id===userId);

    if(!user){
      userBody.innerHTML=
        '<tr><td colspan="4" class="empty">Select a user.</td></tr>';
      return;
    }

    userBody.innerHTML=permissions.map(permission=>{
      const roleDefault=allowed(user.role,permission.permission_key);

      const override=overrides.find(
        x=>
          x.user_id===user.user_id&&
          x.permission_key===permission.permission_key
      );

      const effective=override
        ? override.is_allowed
        : roleDefault;

      return `
        <tr>
          <td class="permission-title">
            <b>${UI.safe(permission.permission_label)}</b>
            <small>${UI.safe(permission.permission_key)}</small>
          </td>

          <td>${roleDefault?"Allowed":"Denied"}</td>

          <td>
            <select
              class="override-select"
              data-user="${user.user_id}"
              data-key="${permission.permission_key}"
            >
              <option value="INHERIT" ${!override?"selected":""}>
                Inherit role
              </option>

              <option value="ALLOW" ${override?.is_allowed===true?"selected":""}>
                Allow
              </option>

              <option value="DENY" ${override?.is_allowed===false?"selected":""}>
                Deny
              </option>
            </select>
          </td>

          <td class="${effective?"effective-yes":"effective-no"}">
            ${effective?"Allowed":"Denied"}
          </td>
        </tr>
      `;
    }).join("");

    document.querySelectorAll(".override-select").forEach(select=>{
      select.onchange=async()=>{
        let result;

        if(select.value==="INHERIT"){
          result=await supabaseClient.rpc(
            "clear_user_permission_override_v2",
            {
              p_user_id:select.dataset.user,
              p_permission_key:select.dataset.key
            }
          );
        }else{
          result=await supabaseClient.rpc(
            "update_user_permission_override_v2",
            {
              p_user_id:select.dataset.user,
              p_permission_key:select.dataset.key,
              p_is_allowed:select.value==="ALLOW"
            }
          );
        }

        if(result.error){
          toast(result.error.message,"danger");
          await load();
          $("permissionUserSelect").value=userId;
          renderUserOverrides();
          return;
        }

        await load();
        $("permissionUserSelect").value=userId;
        renderUserOverrides();
        toast("User permission override updated.");
      };
    });
  }

  $("roleMatrixTab").onclick=()=>{
    $("roleMatrixPanel").hidden=false;
    $("userOverridesPanel").hidden=true;
    $("roleMatrixTab").classList.add("active");
    $("userOverridesTab").classList.remove("active");
  };

  $("userOverridesTab").onclick=()=>{
    $("roleMatrixPanel").hidden=true;
    $("userOverridesPanel").hidden=false;
    $("roleMatrixTab").classList.remove("active");
    $("userOverridesTab").classList.add("active");
  };

  $("permissionUserSelect").onchange=renderUserOverrides;
  $("refreshPermissionsButton").onclick=load;

  try{
    await load();
  }catch(error){
    toast("Permissions module could not load: "+error.message,"danger");
  }
};
