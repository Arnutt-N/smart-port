# Smart Port backend — build from repository root (docker-compose, Render with empty Root Directory).
# Context must include backend/ and database/ (see docker-compose.yaml).
# =========================================================================
# STAGE 1: Composer Dependencies Stage
# =========================================================================
FROM composer:2.7 AS vendor

WORKDIR /app

COPY backend/composer.json backend/composer.lock* ./

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

COPY backend/ .
COPY database/ /var/www/database/
COPY --from=vendor /app/vendor/ ./vendor/

RUN mkdir -p /var/www/html/uploads /var/www/html/storage/rate_limits \
    && chown -R www-data:www-data /var/www/html/uploads /var/www/html/storage \
    && chmod +x /var/www/html/docker-entrypoint.sh

ENV MIGRATIONS_DIR=/var/www/database
ENV RUN_MIGRATIONS=1

RUN echo "PassEnv MYSQL_HOST MYSQL_PORT MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD MYSQL_SSL MYSQL_SSL_CA JWT_SECRET" \
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

EXPOSE 80

ENTRYPOINT ["/var/www/html/docker-entrypoint.sh"]
