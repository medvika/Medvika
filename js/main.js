function searchMedicine() {
    let medicine = document.getElementById("medicineSearch").value;

    if (medicine === "") {
        alert("Please enter medicine name");
    } else {
        alert("Searching for: " + medicine);
    }
}
