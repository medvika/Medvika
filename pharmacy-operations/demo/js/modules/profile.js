window.initProfileModule = async function () {
  const UI = window.MedvikaUI;
  const $ = id => document.getElementById(id);

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value ?? "—";
  }

  function formatRole(role) {
    if (window.MedvikaAuth?.formatRole) {
      return window.MedvikaAuth.formatRole(role);
    }

    return String(role || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  async function loadProfile() {
    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw userError || new Error("Your session has expired.");
    }

    const { data: profile, error } = await supabaseClient
      .from("user_profiles")
      .select(`
        user_id,
        full_name,
        username,
        mobile,
        role,
        pharmacy_id,
        organization_id,
        is_active,
        must_change_password,
        pharmacies(
          id,
          name,
          legal_name
        )
      `)
      .eq("user_id", user.id)
      .single();

    if (error) throw error;

    setText("profileFullName", profile.full_name || "—");
    setText("profileUsername", profile.username || user.email || "—");
    setText("profileRole", formatRole(profile.role));
    setText("profileMobile", profile.mobile || "Not added");

    const pharmacyName =
      profile.pharmacies?.name ||
      profile.pharmacies?.legal_name ||
      "Not assigned";

    setText("profilePharmacy", pharmacyName);

    /*
     * Organization name is not fetched because the current confirmed
     * frontend schema does not establish the organization relation here.
     * Show the linked organization identifier instead of guessing a name.
     */
    setText(
      "profileOrganization",
      profile.organization_id || "Not linked"
    );

    const status = $("profileStatus");
    if (status) {
      status.textContent = profile.is_active ? "Active" : "Inactive";
      status.classList.toggle("inactive", !profile.is_active);
    }

    if (profile.must_change_password) {
      UI?.toast?.(
        "Please change the temporary password for this account.",
        "warning"
      );
    }
  }

  async function changePassword(event) {
    event.preventDefault();

    const password = $("profileNewPassword").value;
    const confirmPassword = $("profileConfirmPassword").value;
    const button = $("profileChangePassword");

    if (password.length < 8) {
      return UI.toast("Use at least 8 characters.", "warning");
    }

    if (password !== confirmPassword) {
      return UI.toast("Passwords do not match.", "warning");
    }

    const oldText = button.textContent;

    try {
      button.disabled = true;
      button.textContent = "Updating...";

      const { error } = await supabaseClient.auth.updateUser({
        password
      });

      if (error) throw error;

      /*
       * Clear the temporary-password flag for the signed-in user's own
       * profile. If RLS blocks this update, password change still succeeds
       * and the flag can later be cleared with a dedicated RPC.
       */
      const {
        data: { user }
      } = await supabaseClient.auth.getUser();

      if (user) {
        const { error: flagError } = await supabaseClient
          .from("user_profiles")
          .update({ must_change_password: false })
          .eq("user_id", user.id);

        if (flagError) {
          console.warn(
            "Password changed, but must_change_password flag could not be cleared:",
            flagError
          );
        }
      }

      $("profileNewPassword").value = "";
      $("profileConfirmPassword").value = "";

      UI.toast("Password changed successfully.", "success");
    } catch (error) {
      UI.toast(
        error?.message || "Unable to change password.",
        "error"
      );
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  $("profilePasswordForm").addEventListener("submit", changePassword);

  $("profileLogout").onclick = async () => {
    if (window.MedvikaAuth?.logout) {
      await window.MedvikaAuth.logout();
      return;
    }

    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  };

  try {
    await loadProfile();
  } catch (error) {
    UI.toast(
      error?.message || "Unable to load profile.",
      "error"
    );
  }
};
