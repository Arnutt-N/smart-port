# Smart Port backend — FALLBACK image (build context = backend/ directory)
#
# ⚠️ ไม่ใช่ตัวที่ควรใช้ deploy: database/ อยู่นอก build context นี้ จึงไม่มีไฟล์ migration
#    ติดมาในภาพเลย (RUN_MIGRATIONS=0) schema ต้อง apply มือทุกครั้ง — เคยทำให้ production
#    ค้างที่ schema รุ่นเก่าโดยไม่มีสัญญาณเตือน ดู docs/adr/0002-schema-parity-gate.md
#
# ตัวที่ควรใช้คือ Dockerfile ที่ repo root (render.yaml ชี้ไปที่นั่นแล้ว) ซึ่งมี production
# hardening เหมือนกันทุกข้อ + copy database/ + ตั้ง RUN_MIGRATIONS=1
#
# ไฟล์นี้คงไว้เป็น fallback เผื่อ Render dashboard ยังตั้ง Root Directory = backend อยู่
# (ค่าใน dashboard ทับ blueprint ได้) วิธีรู้ว่า deploy ใช้ตัวไหน: `GET /` จะคืน
# migrations_available = 0 พร้อม migrations_note ถ้าเป็นภาพจากไฟล์นี้
# =========================================================================
# STAGE 1: Composer Dependencies Stage
# =========================================================================
FROM composer:2.7 AS vendor

WORKDIR /app

COPY composer.json composer.lock* ./

RUN composer install --no-dev --no-interaction --no-plugins --no-scripts --optimize-autoloader --ignore-platform-req=ext-gd

# =========================================================================
# STAGE 2: Production Stage
# =========================================================================
FROM php:8.3-apache

RUN a2enmod rewrite

RUN apt-get update && apt-get install -y \
    libzip-dev \
    unzip \
    && docker-php-ext-install pdo_mysql zip opcache \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN echo "opcache.enable=1\n\
opcache.memory_consumption=128\n\
opcache.max_accelerated_files=10000\n\
opcache.validate_timestamps=0\n\
opcache.revalidate_freq=0" > /usr/local/etc/php/conf.d/opcache.ini

WORKDIR /var/www/html

COPY . .
COPY --from=vendor /app/vendor/ ./vendor/

RUN mkdir -p /var/www/html/uploads /var/www/html/storage/rate_limits /var/www/database \
    && chown -R www-data:www-data /var/www/html/uploads /var/www/html/storage \
    && chmod +x /var/www/html/docker-entrypoint.sh

ENV MIGRATIONS_DIR=/var/www/database
ENV RUN_MIGRATIONS=0

RUN echo "PassEnv MYSQL_HOST MYSQL_PORT MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD MYSQL_SSL MYSQL_SSL_CA JWT_SECRET RENDER_GIT_COMMIT" \
    >> /etc/apache2/conf-enabled/passenv.conf

RUN printf '%s\n' \
    'SetEnvIfNoCase Authorization "^(.*)$" HTTP_AUTHORIZATION=$1' \
    '<Directory /var/www/html>' \
    '    CGIPassAuth On' \
    '</Directory>' \
    > /etc/apache2/conf-enabled/authorization.conf

RUN printf "AddDefaultCharset UTF-8\n" > /etc/apache2/conf-enabled/charset.conf \
    && printf "default_charset = \"UTF-8\"\n" > /usr/local/etc/php/conf.d/charset.ini

# Production-safe PHP error settings: log errors but never display HTML to clients
RUN printf '%s\n' \
    'display_errors = Off' \
    'log_errors = On' \
    'html_errors = Off' \
    'error_log = /dev/stderr' \
    'error_reporting = E_ALL' \
    'expose_php = Off' \
    > /usr/local/etc/php/conf.d/zz-production-errors.ini

# F17/T19: upload limits 25MB — PHP default 2M ตัดรูปขนาดใหญ่
# ต้องตรงกับ client_max_body_size 25m ใน frontend/nginx.conf (/api/ location)
RUN printf '%s\n' \
    'upload_max_filesize = 25M' \
    'post_max_size = 25M' \
    > /usr/local/etc/php/conf.d/zz-upload-limits.ini

EXPOSE 80

ENTRYPOINT ["/var/www/html/docker-entrypoint.sh"]
