window.initErpConfigurationModule = async function () {
  const go = route => {
    if (window.MedvikaRouter?.navigate) {
      window.MedvikaRouter.navigate(route);
    } else {
      location.hash = route;
    }
  };

  const bind = (id, route) => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => go(route);
  };

  bind("cfgOrganization", "organization");
  bind("cfgBranchSettings", "pharmacy-profile");
  bind("cfgPermissions", "permissions");
  bind("cfgBackup", "backup");
};