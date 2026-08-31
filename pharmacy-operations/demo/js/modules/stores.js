window.initStoresModule = async function () {
  const UI = window.MedvikaUI;
  const $ = id => document.getElementById(id);
  const pid = window.MedvikaAuth?.profile?.pharmacy_id;

  let stores = [];

  async function orgId() {
    const { data, error } = await supabaseClient
      .from("pharmacies")
      .select("organization_id")
      .eq("id", pid)
      .single();

    if (error) throw error;
    return data.organization_id;
  }

  function badge(text, kind = "") {
    return `<span class="chain-badge ${kind}">${UI.safe(text)}</span>`;
  }

  function actionButtons(store) {
    return `
      <div class="chain-actions">
        <button
          type="button"
          data-store-action="edit"
          data-store-id="${store.id}"
        >Edit</button>

        ${
          !store.is_main_store
            ? `<button
                 type="button"
                 data-store-action="main"
                 data-store-id="${store.id}"
               >Make Main</button>`
            : ""
        }

        ${
          !store.is_main_store
            ? `<button
                 type="button"
                 data-store-action="toggle"
                 data-store-id="${store.id}"
               >${store.is_active === false ? "Activate" : "Deactivate"}</button>`
            : ""
        }
      </div>
    `;
  }

  async function load() {
    const oid = await orgId();

    const { data, error } = await supabaseClient
      .from("pharmacies")
      .select("*")
      .eq("organization_id", oid)
      .order("is_main_store", { ascending: false })
      .order("name");

    if (error) throw error;

    stores = data || [];

    $("storeBody").innerHTML = stores.length
      ? stores.map(s => `
          <tr>
            <td><b>${UI.safe(s.name)}</b></td>
            <td>${UI.safe(s.store_code || "—")}</td>
            <td>${UI.safe(s.city || "—")}</td>
            <td>${UI.safe(s.state || "—")}</td>
            <td>${UI.safe(s.gst_number || "—")}</td>
            <td>${UI.safe(s.drug_license_number || "—")}</td>
            <td>${s.is_main_store ? badge("Main", "success") : "—"}</td>
            <td>
              ${
                s.is_active === false
                  ? badge("Inactive", "danger")
                  : badge("Active", "success")
              }
            </td>
            <td>${actionButtons(s)}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="9">No branches found.</td></tr>`;

    bindActions();
  }

  function clearForm() {
    $("storeEditId").value = "";

    [
      "storeName",
      "storeCode",
      "storeGstin",
      "storeRegisteredState",
      "storeGstCode",
      "storeDrugLicence",
      "storePhone",
      "storeEmail",
      "storeAddress1",
      "storeAddress2",
      "storeCity",
      "storeState",
      "storePin"
    ].forEach(id => {
      $(id).value = "";
    });
  }

  function openNew() {
    clearForm();
    $("storeModalTitle").textContent = "New Store";
    $("storeModalHint").textContent =
      "Create a pharmacy location in this organization.";
    $("storeSave").textContent = "Create Store";
    $("storeModal").hidden = false;
  }

  function openEdit(storeId) {
    const s = stores.find(x => String(x.id) === String(storeId));
    if (!s) return;

    $("storeEditId").value = s.id;
    $("storeName").value = s.name || "";
    $("storeCode").value = s.store_code || "";
    $("storeGstin").value = s.gst_number || "";
    $("storeRegisteredState").value = s.registered_state || "";
    $("storeGstCode").value = s.gst_state_code || "";
    $("storeDrugLicence").value = s.drug_license_number || "";
    $("storePhone").value = s.phone || "";
    $("storeEmail").value = s.email || "";
    $("storeAddress1").value = s.address_line_1 || "";
    $("storeAddress2").value = s.address_line_2 || "";
    $("storeCity").value = s.city || "";
    $("storeState").value = s.state || "";
    $("storePin").value = s.postal_code || "";

    $("storeModalTitle").textContent = "Edit Store";
    $("storeModalHint").textContent =
      "Update branch identity, licence and contact details.";
    $("storeSave").textContent = "Save Changes";
    $("storeModal").hidden = false;
  }

  async function save() {
    const editId = $("storeEditId").value;
    const name = $("storeName").value.trim();
    const code = $("storeCode").value.trim().toUpperCase();

    if (!name || !code) {
      return UI.toast("Store name and code are required.", "warning");
    }

    const button = $("storeSave");
    const oldText = button.textContent;

    try {
      button.disabled = true;
      button.textContent = editId ? "Saving..." : "Creating...";

      if (editId) {
        const { error } = await supabaseClient.rpc(
          "update_organization_store",
          {
            p_pharmacy_id: editId,
            p_name: name,
            p_store_code: code,
            p_phone: $("storePhone").value.trim() || null,
            p_email: $("storeEmail").value.trim() || null,
            p_gst_number: $("storeGstin").value.trim() || null,
            p_registered_state:
              $("storeRegisteredState").value.trim() || null,
            p_gst_state_code: $("storeGstCode").value.trim() || null,
            p_drug_license_number:
              $("storeDrugLicence").value.trim() || null,
            p_address_line_1: $("storeAddress1").value.trim() || null,
            p_address_line_2: $("storeAddress2").value.trim() || null,
            p_city: $("storeCity").value.trim() || null,
            p_state: $("storeState").value.trim() || null,
            p_postal_code: $("storePin").value.trim() || null
          }
        );

        if (error) throw error;

        UI.toast("Store updated.", "success");
      } else {
        const { error } = await supabaseClient.rpc(
          "create_organization_store",
          {
            p_name: name,
            p_store_code: code,
            p_phone: $("storePhone").value.trim() || null,
            p_email: $("storeEmail").value.trim() || null,
            p_gst_number: $("storeGstin").value.trim() || null,
            p_registered_state:
              $("storeRegisteredState").value.trim() || null,
            p_gst_state_code: $("storeGstCode").value.trim() || null,
            p_drug_license_number:
              $("storeDrugLicence").value.trim() || null,
            p_address_line_1: $("storeAddress1").value.trim() || null,
            p_address_line_2: $("storeAddress2").value.trim() || null,
            p_city: $("storeCity").value.trim() || null,
            p_state: $("storeState").value.trim() || null,
            p_postal_code: $("storePin").value.trim() || null
          }
        );

        if (error) throw error;

        UI.toast("Store created.", "success");
      }

      $("storeModal").hidden = true;
      await load();
    } catch (error) {
      UI.toast(error?.message || "Unable to save store.", "error");
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function makeMain(storeId) {
    if (!confirm("Make this the main branch for the organization?")) return;

    const { error } = await supabaseClient.rpc(
      "set_organization_main_store",
      { p_pharmacy_id: storeId }
    );

    if (error) return UI.toast(error.message, "error");

    UI.toast("Main branch updated.", "success");
    await load();
  }

  async function toggleStore(storeId) {
    const store = stores.find(x => String(x.id) === String(storeId));
    if (!store) return;

    if (store.is_main_store) {
      return UI.toast(
        "The main branch cannot be deactivated. Make another branch main first.",
        "warning"
      );
    }

    const nextActive = store.is_active === false;

    if (
      !confirm(
        `${nextActive ? "Activate" : "Deactivate"} ${store.name}?`
      )
    ) return;

    const { error } = await supabaseClient.rpc(
      "set_organization_store_active",
      {
        p_pharmacy_id: storeId,
        p_is_active: nextActive
      }
    );

    if (error) return UI.toast(error.message, "error");

    UI.toast(
      nextActive ? "Store activated." : "Store deactivated.",
      "success"
    );

    await load();
  }

  function bindActions() {
    document
      .querySelectorAll("[data-store-action]")
      .forEach(button => {
        button.onclick = async () => {
          const action = button.dataset.storeAction;
          const storeId = button.dataset.storeId;

          if (action === "edit") return openEdit(storeId);
          if (action === "main") return makeMain(storeId);
          if (action === "toggle") return toggleStore(storeId);
        };
      });
  }

  $("storeNew").onclick = openNew;

  $("storeClose").onclick = () => {
    $("storeModal").hidden = true;
  };

  $("storeSave").onclick = save;

  try {
    await load();
  } catch (e) {
    UI.toast(e.message, "error");
  }
};