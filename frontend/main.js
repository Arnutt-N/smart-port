// สำหรับมือใหม่: JS นี้คือ "ส่วนหน้าบ้าน" – ดึงข้อมูลจาก API และแสดงผล
const API_BASE = "http://localhost:8000/" // เปลี่ยนเป็น server จริง

function login() {
  const form = document.getElementById("login-form")
  form.innerHTML = `
    <input id="username" placeholder="ชื่อผู้ใช้" class="border p-2">
    <input id="password" type="password" placeholder="รหัสผ่าน" class="border p-2">
    <button onclick="doLogin()" class="bg-blue-500 text-white p-2">เข้าสู่ระบบ</button>
  `
}

function doLogin() {
  const username = document.getElementById("username").value
  const password = document.getElementById("password").value
  fetch(API_BASE + "login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.token) {
        localStorage.setItem("token", data.token)
        form.style.display = "none"
        loadProfile()
        loadForecast()
        document.getElementById("photo-upload").classList.remove("hidden")
        document
          .getElementById("uploadForm")
          .addEventListener("submit", uploadPhoto)
      } else {
        alert("เข้าสู่ระบบล้มเหลว")
      }
    })
}

function loadProfile() {
  const token = localStorage.getItem("token")
  fetch(API_BASE + "profile/1", {
    // id = 1 สำหรับ test
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      document.getElementById("profile-section").innerHTML = `
      <h2>โปรไฟล์</h2>
      <p>ชื่อ: ${data.full_name}</p>
      <img src="${API_BASE}${data.photo_path}" alt="ภาพโปรไฟล์" class="w-20 h-20">
    `
      document.getElementById("profile-section").classList.remove("hidden")
    })
}

function uploadPhoto(e) {
  e.preventDefault()
  const formData = new FormData()
  formData.append("photo", document.getElementById("photoInput").files[0])
  formData.append("servant_id", 1) // test id
  const token = localStorage.getItem("token")
  fetch(API_BASE + "photos", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => alert(data.success ? "อัพโหลดสำเร็จ" : "ล้มเหลว"))
}

function loadForecast() {
  const token = localStorage.getItem("token")
  fetch(API_BASE + "forecast", {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => res.json())
    .then((data) => {
      let html = "<h2>การคาดการณ์</h2><ul>"
      data.forEach(
        (item) =>
          (html += `<li>${item.notification_type}: ${item.due_date}</li>`)
      )
      html += "</ul>"
      document.getElementById("forecast-section").innerHTML = html
      document.getElementById("forecast-section").classList.remove("hidden")
    })
}

// เริ่มต้น
login()
