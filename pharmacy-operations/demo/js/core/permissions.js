window.MedvikaPermissions={
  loaded:false,
  map:{},

  async load(){
    const {data,error}=await supabaseClient.rpc("get_my_erp_permissions_v2");

    if(error){
      console.error("Permission load failed",error);
      this.loaded=false;
      this.map={};
      return false;
    }

    this.map={};

    (data||[]).forEach(row=>{
      this.map[row.permission_key]=row.is_allowed===true;
    });

    this.loaded=true;
    return true;
  },

  can(permissionKey){
    if(!permissionKey)return true;

    if(window.MedvikaAuth?.profile?.role==="super_admin"){
      return true;
    }

    return this.loaded
      ? this.map[permissionKey]===true
      : false;
  },

  require(permissionKey,message){
    const allowed=this.can(permissionKey);

    if(!allowed&&message){
      window.MedvikaUI?.toast(message,"error");
    }

    return allowed;
  },

  applyActionGuards(root=document){
    root.querySelectorAll("[data-permission]").forEach(element=>{
      const allowed=this.can(element.dataset.permission);

      element.hidden=!allowed;
      element.disabled=!allowed;
    });
  }
};

window.MedvikaLegacyHasPermission=
  window.MedvikaAuth?.hasPermission
    ? window.MedvikaAuth.hasPermission.bind(window.MedvikaAuth)
    : null;

if(window.MedvikaAuth){
  window.MedvikaAuth.hasPermission=function(permissionKey){
    if(this.profile?.role==="super_admin"){
      return true;
    }

    if(window.MedvikaPermissions.loaded){
      return window.MedvikaPermissions.can(permissionKey);
    }

    return window.MedvikaLegacyHasPermission
      ? window.MedvikaLegacyHasPermission(permissionKey)
      : false;
  };
}
