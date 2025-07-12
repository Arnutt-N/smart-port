// สำหรับมือใหม่: JS นี้จัดการ events เช่น สลับ theme และ load data
document.addEventListener("DOMContentLoaded", () => {
  // Load saved theme (จาก localStorage)
  const savedTheme = localStorage.getItem("theme") || "semi-dark"
  document.body.classList.add(savedTheme)
  document.getElementById("theme-select").value = savedTheme

  // Theme Switcher
  document.getElementById("theme-select").addEventListener("change", (e) => {
    const newTheme = e.target.value
    document.body.classList.remove("light", "dark", "semi-dark", "bordered")
    document.body.classList.add(newTheme)
    localStorage.setItem("theme", newTheme)
  })

  // Sample Chart.js for Dashboard (modern data viz)
  const ctx = document.getElementById("statsChart").getContext("2d")
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["ข้าราชการ", "การแจ้งเตือน", "ผลงาน"],
      datasets: [
        {
          label: "สถิติ",
          data: [100, 20, 50], // Placeholder - ดึงจาก API จริง
          backgroundColor: "rgba(59, 130, 246, 0.5)", // Match accent
        },
      ],
    },
    options: { scales: { y: { beginAtZero: true } } },
  })

  // Integrate API (จาก backend) - ตัวอย่าง load profile
  // fetch('http://localhost:8000/profile/1', { headers: { 'Authorization': `Bearer ${token}` } }) ...

  // เพิ่ม logic สำหรับ menu click (e.g., scroll to section)
  document.querySelectorAll("nav a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault()
      const target = document.querySelector(link.getAttribute("href"))
      target.scrollIntoView({ behavior: "smooth" })
    })
  })
})
