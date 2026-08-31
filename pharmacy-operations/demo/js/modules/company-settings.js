window.initSettingsModule =
window.initPharmacyProfileModule =
async function initSettingsModule() {
  const UI = window.MedvikaUI;
  const form = document.getElementById("companyForm");

  if (!form) {
    throw new Error("Company Settings form was not found.");
  }

  const GST_STATES = [
    ["01","Jammu and Kashmir"],["02","Himachal Pradesh"],["03","Punjab"],["04","Chandigarh"],
    ["05","Uttarakhand"],["06","Haryana"],["07","Delhi"],["08","Rajasthan"],["09","Uttar Pradesh"],
    ["10","Bihar"],["11","Sikkim"],["12","Arunachal Pradesh"],["13","Nagaland"],["14","Manipur"],
    ["15","Mizoram"],["16","Tripura"],["17","Meghalaya"],["18","Assam"],["19","West Bengal"],
    ["20","Jharkhand"],["21","Odisha"],["22","Chhattisgarh"],["23","Madhya Pradesh"],["24","Gujarat"],
    ["26","Dadra and Nagar Haveli and Daman and Diu"],["27","Maharashtra"],["29","Karnataka"],
    ["30","Goa"],["31","Lakshadweep"],["32","Kerala"],["33","Tamil Nadu"],["34","Puducherry"],
    ["35","Andaman and Nicobar Islands"],["36","Telangana"],["37","Andhra Pradesh"],["38","Ladakh"]
  ];

  const fields = [
    "name","legal_name","gst_number","registered_state","gst_state_code",
    "drug_license_number","phone","email","address_line_1","address_line_2",
    "city","state","postal_code"
  ];

  const pharmacyId = window.MedvikaAuth.profile?.pharmacy_id;

  if (!pharmacyId) {
    throw new Error("No pharmacy is linked to this user.");
  }

  const registeredState = document.getElementById("registered_state");
  const gstStateCode = document.getElementById("gst_state_code");

  if (registeredState) {
    registeredState.innerHTML =
      '<option value="">Select state</option>' +
      GST_STATES.map(([code,name]) =>
        `<option value="${UI.safe(name)}" data-code="${code}">${UI.safe(name)}</option>`
      ).join("");

    registeredState.onchange = () => {
      gstStateCode.value =
        registeredState.selectedOptions[0]?.dataset?.code || "";
    };
  }

  function validateGst() {
    const gstin = String(document.getElementById("gst_number")?.value || "")
      .trim().toUpperCase();
    const code = String(gstStateCode?.value || "").trim();

    if (!gstin) return;

    if (!/^\d{2}[A-Z0-9]{13}$/.test(gstin)) {
      throw new Error("GSTIN must be a valid 15-character GSTIN.");
    }

    if (code && gstin.slice(0,2) !== code) {
      throw new Error("GSTIN state prefix does not match the Registered State.");
    }
  }

  async function loadSettings() {
    const { data, error } = await supabaseClient
      .from("pharmacies")
      .select(fields.join(","))
      .eq("id", pharmacyId)
      .single();

    if (error) throw error;

    fields.forEach((fieldName) => {
      const input = document.getElementById(fieldName);
      if (input) input.value = data?.[fieldName] ?? "";
    });

    // Backward-compatible default: use normal address state when registered_state is not set yet.
    if (registeredState && !registeredState.value && data?.state) {
      const matching = [...registeredState.options].find(
        o => o.value.toLowerCase() === String(data.state).toLowerCase()
      );
      if (matching) {
        registeredState.value = matching.value;
        gstStateCode.value = matching.dataset.code || data?.gst_state_code || "";
      }
    }
  }

  form.onsubmit = async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Saving Settings...";

    try {
      validateGst();

      const updates = {};
      fields.forEach((fieldName) => {
        const input = document.getElementById(fieldName);
        updates[fieldName] = input?.value?.trim() || null;
      });

      if (updates.gst_number) {
        updates.gst_number = updates.gst_number.toUpperCase();
      }

      const { error } = await supabaseClient
        .from("pharmacies")
        .update(updates)
        .eq("id", pharmacyId);

      if (error) throw error;

      UI.toast("Company settings saved successfully.");
    } catch (error) {
      UI.toast("Settings could not be saved: " + error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Save Settings";
    }
  };

  await loadSettings();
};