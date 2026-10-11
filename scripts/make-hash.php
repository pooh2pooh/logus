<?php
declare(strict_types=1);

/*
 * Генератор bcrypt-хэша пароля для private/secrets.php.
 * Использование: php scripts/make-hash.php 'ваш-пароль'
 */

$pass = $argv[1] ?? '';
if ($pass === '') {
    fwrite(STDERR, "Использование: php scripts/make-hash.php 'ваш-пароль'\n");
    exit(1);
}

echo password_hash($pass, PASSWORD_DEFAULT, ['cost' => 12]) . "\n";
