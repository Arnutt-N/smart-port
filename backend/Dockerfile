# =========================================================================
# STAGE 1: Composer Dependencies Stage
# =========================================================================
FROM composer:2.7 AS vendor

WORKDIR /app

COPY composer.json composer.lock* ./

RUN composer install --no-dev --no-interaction --no-plugins --no-scripts --optimize-autoloader

# =========================================================================
# STAGE 2: Production Stage
# =========================================================================
FROM php:8.3-apache

# --- FIX ---
# ไม่ต้องเปลี่ยน DocumentRoot เพราะโปรเจกต์นี้ไม่มีโฟลเดอร์ public
# Apache จะใช้ค่า default คือ /var/www/html ซึ่งถูกต้องแล้ว
# ENV APACHE_DOCUMENT_ROOT /var/www/html/public
# RUN sed -ri ...

# เปิดใช้งาน mod_rewrite สำหรับ routing (เช่น .htaccess)
RUN a2enmod rewrite

# ติดตั้ง PHP extensions ที่จำเป็นสำหรับโปรเจกต์
RUN apt-get update && apt-get install -y \
    libzip-dev \
    unzip \
    && docker-php-ext-install pdo_mysql zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html

# คัดลอก source code ทั้งหมด
COPY . .

# คัดลอก vendor ที่ติดตั้งไว้แล้วจาก stage แรก
COPY --from=vendor /app/vendor/ ./vendor/

# สร้าง directory สำหรับ uploads และกำหนดสิทธิ์ให้ Apache
# แยก storage ออกจาก source code เพื่อความปลอดภัย
RUN mkdir -p /var/www/html/uploads \
    && chown -R www-data:www-data /var/www/html/uploads

# เปิด port 80
EXPOSE 80
