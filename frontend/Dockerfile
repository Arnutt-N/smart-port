# =========================================================================
# STAGE 1: Build Stage
# =========================================================================
# === FIX 3 ===
# เปลี่ยนไปใช้ Debian-based image (slim version) เพื่อความเข้ากันได้ที่ดีกว่า
# สำหรับ native modules เมื่อเทียบกับ Alpine
FROM node:20-slim AS builder

# ระบุ build-time argument สำหรับ VITE_API_URL
ARG VITE_API_URL=http://localhost:8000

# กำหนด working directory ภายใน container
WORKDIR /app

# คัดลอกเฉพาะ package.json เท่านั้น เพื่อบังคับให้ npm install
# สร้าง dependency tree ใหม่ที่เหมาะสมกับ Linux
COPY package.json ./

# === FIX 3 ===
# เพิ่ม flag --no-optional เพื่อข้ามการติดตั้ง optional dependencies
# ซึ่งเป็นสาเหตุของปัญหา (เช่น Rollup เวอร์ชั่นสำหรับ Windows)
# และล้าง cache ก่อนเพื่อความแน่นอน
RUN npm cache clean --force && npm install --no-optional

# คัดลอกไฟล์ source code ทั้งหมดเข้ามาใน image
# (ไฟล์ที่ไม่จำเป็นจะถูกกรองออกโดย .dockerignore)
COPY . .

# ตั้งค่า Environment Variable เพื่อให้ Vite สามารถใช้งานได้ตอน build
ENV VITE_API_URL=${VITE_API_URL}

# สั่ง build โปรเจกต์ Vite
RUN npm run build

# =========================================================================
# STAGE 2: Production Stage
# =========================================================================
# ใช้ nginx:alpine-slim ซึ่งเป็น image ที่มีขนาดเล็กและปลอดภัยสำหรับ production
FROM nginx:alpine-slim

# ลบ default Nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# คัดลอก Nginx configuration ที่เราเตรียมไว้สำหรับ Vite SPA
# **สำคัญ**: ตรวจสอบให้แน่ใจว่าคุณมีไฟล์ nginx.conf อยู่ในโฟลเดอร์ frontend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# คัดลอกไฟล์ที่ buildเสร็จแล้วจาก stage 'builder' มายัง web root ของ Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# เปิด port 80 สำหรับ HTTP
EXPOSE 80

# สั่งให้ Nginx ทำงานใน foreground เมื่อ container เริ่มทำงาน
CMD ["nginx", "-g", "daemon off;"]
