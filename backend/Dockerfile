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

# ติดตั้ง PHP extensions สำหรับ MySQL
RUN apt-get update && apt-get install -y \
    libzip-dev \
    unzip \
    && docker-php-ext-install pdo_mysql zip opcache \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# เปิดใช้งาน OPcache สำหรับ production
RUN echo "opcache.enable=1\n\
opcache.memory_consumption=128\n\
opcache.max_accelerated_files=10000\n\
opcache.validate_timestamps=0\n\
opcache.revalidate_freq=0" > /usr/local/etc/php/conf.d/opcache.ini

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
