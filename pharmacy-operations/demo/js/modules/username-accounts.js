window.initUsernameAccountsModule = async function () {
  const UI = window.MedvikaUI;
  const $ = id => document.getElementById(id);

  async function loadStores() {
    const { data, error } = await supabaseClient.rpc("list_my_stores");

    if (error) throw error;

    $("uaStore").innerHTML =
      '<option value="">Select store</option>' +
      (data || [])
        .map(
          x =>
            `<option value="${x.pharmacy_id}">${UI.safe(x.store_name)} (${UI.safe(
              x.store_code || ""
            )})</option>`
        )
        .join("");
  }

  async function create() {
    const username = $("uaUsername").value.trim().toLowerCase();
    const name = $("uaName").value.trim();
    const password = $("uaPassword").value;
    const role = $("uaRole").value;
    const storeId = $("uaStore").value;

    if (!username || !name || !password || !role || !storeId) {
      return UI.toast(
        "Username, name, password, role and store are required.",
        "warning"
      );
    }

    if (password.length < 8) {
      return UI.toast("Use at least 8 characters.", "warning");
    }

    const createButton = $("uaCreate");
    const oldText = createButton?.textContent;

    try {
      if (createButton) {
        createButton.disabled = true;
        createButton.textContent = "Creating...";
      }

      const { data, error } = await supabaseClient.functions.invoke(
        "create-erp-staff-user",
        {
          body: {
            username,
            full_name: name,
            password,
            role,
            pharmacy_id: storeId
          }
        }
      );

      if (error) {
        let message = error.message || "Unable to create staff account.";

        /*
         * Supabase FunctionsHttpError can contain the JSON response from
         * the Edge Function in error.context.
         */
        try {
          if (error.context && typeof error.context.json === "function") {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          }
        } catch (_) {
          // Keep original Supabase error message if response parsing fails.
        }

        return UI.toast(message, "error");
      }

      if (data?.error) {
        return UI.toast(data.error, "error");
      }

      UI.toast(data?.message || "Staff account created successfully.", "success");

      $("uaUsername").value = "";
      $("uaName").value = "";
      $("uaPassword").value = "";
      $("uaRole").value = "";
      $("uaStore").value = "";
    } catch (e) {
      UI.toast(e?.message || "Unable to create staff account.", "error");
    } finally {
      if (createButton) {
        createButton.disabled = false;
        createButton.textContent = oldText || "Create Staff Login";
      }
    }
  }

  $("uaCreate").onclick = create;

  try {
    await loadStores();
  } catch (e) {
    UI.toast(e?.message || "Unable to load stores.", "error");
  }
};
