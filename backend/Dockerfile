# Base image จาก PHP official (เวอร์ชัน 8.3 สำหรับ modern PHP)
FROM php:8.3-apache

# ติดตั้ง dependencies (PDO สำหรับ MySQL, composer สำหรับ JWT)
RUN apt-get update && apt-get install -y libzip-dev unzip \
    && docker-php-ext-install pdo_mysql zip \
    && a2enmod rewrite

# Copy โค้ด backend เข้า container
WORKDIR /var/www/html
COPY . /var/www/html

# Install Composer และ dependencies (เช่น firebase/php-jwt)
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer \
    && composer install --no-dev --optimize-autoloader

# Set permissions สำหรับ uploads
RUN mkdir -p uploads && chown -R www-data:www-data uploads

# Expose port 80 สำหรับ web server
EXPOSE 80