window.initNewOrganizationModule = async function () {
  const UI = window.MedvikaUI;
  const $ = id => document.getElementById(id);

  const role = window.MedvikaAuth?.profile?.role;

  function go(route) {
    if (window.MedvikaRouter?.navigate) {
      window.MedvikaRouter.navigate(route);
    } else {
      location.hash = route;
    }
  }

  $("newOrgBack").onclick = () => go("organization");

  if (role !== "super_admin") {
    $("newOrgAccessWarning").hidden = false;
    $("newOrgForm").hidden = true;
    return;
  }

  $("newOrgForm").onsubmit = async event => {
    event.preventDefault();

    const button = $("newOrgCreate");
    const oldText = button.textContent;

    const payload = {
      organization: {
        name: $("newOrgName").value.trim(),
        legal_name: $("newOrgLegalName").value.trim() || null,
        code: $("newOrgCode").value.trim().toUpperCase() || null,
        phone: $("newOrgPhone").value.trim() || null,
        email: $("newOrgEmail").value.trim() || null
      },

      branch: {
        name: $("newBranchName").value.trim(),
        store_code: $("newBranchCode").value.trim().toUpperCase(),
        legal_name: $("newBranchLegalName").value.trim() || null,
        gst_number: $("newBranchGstin").value.trim().toUpperCase() || null,
        drug_license_number:
          $("newBranchDrugLicence").value.trim() || null,
        phone: $("newBranchPhone").value.trim() || null,
        email: $("newBranchEmail").value.trim() || null,
        address_line_1: $("newBranchAddress1").value.trim() || null,
        address_line_2: $("newBranchAddress2").value.trim() || null,
        city: $("newBranchCity").value.trim() || null,
        state: $("newBranchState").value.trim() || null,
        postal_code: $("newBranchPin").value.trim() || null
      },

      admin: {
        full_name: $("newAdminName").value.trim(),
        username: $("newAdminUsername").value.trim().toLowerCase(),
        password: $("newAdminPassword").value,
        mobile: $("newAdminMobile").value.trim() || null
      }
    };

    if (
      !payload.organization.name ||
      !payload.branch.name ||
      !payload.branch.store_code ||
      !payload.admin.full_name ||
      !payload.admin.username ||
      !payload.admin.password
    ) {
      return UI.toast(
        "Complete all required organization, branch and administrator fields.",
        "warning"
      );
    }

    if (payload.admin.password.length < 8) {
      return UI.toast(
        "Temporary password must contain at least 8 characters.",
        "warning"
      );
    }

    try {
      button.disabled = true;
      button.textContent = "Creating Organization...";

      const { data, error } = await supabaseClient.functions.invoke(
        "create-erp-organization",
        { body: payload }
      );

      if (error) {
        let message = error.message || "Unable to create organization.";

        try {
          if (error.context && typeof error.context.json === "function") {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          }
        } catch (_) {}

        throw new Error(message);
      }

      if (data?.error) throw new Error(data.error);

      $("newOrgResult").hidden = false;
      $("newOrgResult").innerHTML = `
        <h3>Organization Created</h3>
        <p><b>${UI.safe(data.organization?.name || payload.organization.name)}</b></p>
        <p>Main branch: ${UI.safe(data.branch?.name || payload.branch.name)}</p>
        <p>Administrator username: <b>${UI.safe(data.admin?.username || payload.admin.username)}</b></p>
        <p>The administrator can now sign in using username + temporary password.</p>
      `;

      UI.toast("Organization created successfully.", "success");

      // Prevent accidental duplicate submission.
      button.disabled = true;
      button.textContent = "Organization Created";

    } catch (error) {
      UI.toast(
        error?.message || "Unable to create organization.",
        "error"
      );

      button.disabled = false;
      button.textContent = oldText;
    }
  };
};