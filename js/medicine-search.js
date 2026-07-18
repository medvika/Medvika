const SUPABASE_URL = "https://etevzodzxhsdwidtrmwv.supabase.co";
const SUPABASE_KEY =
  "sb_publishable_iKWBOAxrWTZfU6Qb5PYd5Q_0y80GEOw";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const searchInput = document.getElementById("medicineSearchInput");
const searchButton = document.getElementById("medicineSearchButton");
const resultsContainer = document.getElementById("medicineSearchResults");

async function searchMedicines() {
  const searchTerm = searchInput.value.trim();

  if (searchTerm.length < 2) {
    resultsContainer.innerHTML =
      "<p>Please enter at least 2 characters.</p>";
    return;
  }

  resultsContainer.innerHTML = "<p>Searching medicines...</p>";
  searchButton.disabled = true;

  try {
    const { data, error } = await supabaseClient
      .from("medicines")
      .select(`
        id,
        brand_name,
        generic_name,
        composition,
        strength,
        dosage_form,
        prescription_status,
        mrp,
        slug
      `)
      .eq("is_active", true)
      .eq("is_verified", true)
      .or(
        `brand_name.ilike.%${searchTerm}%,generic_name.ilike.%${searchTerm}%,composition.ilike.%${searchTerm}%`
      )
      .order("brand_name")
      .limit(20);

    if (error) {
      throw error;
    }

    displayMedicineResults(data);
  } catch (error) {
    console.error("Medicine search error:", error);

    resultsContainer.innerHTML = `
      <p>
        Medicine search is temporarily unavailable.
        Please try again shortly.
      </p>
    `;
  } finally {
    searchButton.disabled = false;
  }
}

function displayMedicineResults(medicines) {
  if (!medicines || medicines.length === 0) {
    resultsContainer.innerHTML = `
      <div class="medicine-no-results">
        <h3>No medicine found</h3>
        <p>Try searching by brand name, generic name or composition.</p>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = medicines
    .map((medicine) => {
      const price =
        medicine.mrp !== null
          ? `₹${Number(medicine.mrp).toFixed(2)}`
          : "Price not available";

      return `
        <article class="medicine-result-card">
          <h3>${escapeHtml(medicine.brand_name)}</h3>

          <p>
            <strong>Generic:</strong>
            ${escapeHtml(medicine.generic_name)}
          </p>

          <p>
            <strong>Composition:</strong>
            ${escapeHtml(medicine.composition)}
          </p>

          ${
            medicine.strength
              ? `<p><strong>Strength:</strong> ${escapeHtml(
                  medicine.strength
                )}</p>`
              : ""
          }

          ${
            medicine.dosage_form
              ? `<p><strong>Form:</strong> ${escapeHtml(
                  medicine.dosage_form
                )}</p>`
              : ""
          }

          <p>
            <strong>Status:</strong>
            ${escapeHtml(medicine.prescription_status || "Not specified")}
          </p>

          <p><strong>MRP:</strong> ${price}</p>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value ?? "";
  return element.innerHTML;
}

searchButton.addEventListener("click", searchMedicines);

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    searchMedicines();
  }
});
