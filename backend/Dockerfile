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

# เปิดใช้งาน mod_rewrite สำหรับ routing (เช่น .htaccess)
RUN a2enmod rewrite

# --- FIX for PostgreSQL ---
# ติดตั้ง client library ของ PostgreSQL (libpq-dev)
# และติดตั้ง PHP extension สำหรับ PostgreSQL (pdo_pgsql) แทน pdo_mysql
RUN apt-get update && apt-get install -y \
    libpq-dev \
    libzip-dev \
    unzip \
    && docker-php-ext-install pdo_pgsql zip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html

# คัดลอก source code ทั้งหมด
COPY . .

# คัดลอก vendor ที่ติดตั้งไว้แล้วจาก stage แรก
COPY --from=vendor /app/vendor/ ./vendor/

# สร้าง directory สำหรับ uploads และกำหนดสิทธิ์ให้ Apache
RUN mkdir -p /var/www/html/uploads \
    && chown -R www-data:www-data /var/www/html/uploads

# เปิด port 80
EXPOSE 80
