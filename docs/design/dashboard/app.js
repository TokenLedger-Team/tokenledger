const toast = document.getElementById("toast");
let toastTimer;
function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    const page = button.dataset.page;
    document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item === button));
    if (page !== "Dashboard") notify(`${page} view selected — prototype navigation`);
    else notify("You're viewing the dashboard");
  });
});

document.getElementById("period").addEventListener("change", event => {
  const days = Number(event.target.value);
  const values = {
    7: { spend: "$8,742.16", start: "Oct 09", end: "Oct 16", label: "Last 7 days" },
    30: { spend: "$31,408.52", start: "Sep 16", end: "Oct 16", label: "Last 30 days" },
    90: { spend: "$93,128.22", start: "Jul 18", end: "Oct 16", label: "Last 90 days" }
  };
  const data = values[days];
  document.getElementById("quickSpend").textContent = data.spend;
  document.getElementById("totalSpend").textContent = data.spend;
  document.getElementById("chartStart").textContent = data.start;
  document.getElementById("chartEnd").textContent = data.end;
  notify(`Showing demo data for ${data.label.toLowerCase()}`);
});

let projectionVisible = true;
document.getElementById("timelineToggle").addEventListener("click", event => {
  projectionVisible = !projectionVisible;
  document.querySelector(".timeline-projection").style.opacity = projectionVisible ? "1" : "0";
  document.querySelector(".peak-line").style.opacity = projectionVisible ? "1" : ".35";
  event.currentTarget.textContent = projectionVisible ? "Hide projection" : "Show projection";
});


document.querySelectorAll(".more-btn").forEach(button => {
  button.addEventListener("click", () => notify("Widget options — more controls can be added here."));
});

document.querySelector(".profile").addEventListener("click", () => notify("Account menu — Acme Corp workspace"));
