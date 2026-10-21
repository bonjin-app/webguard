<?php
declare(strict_types=1);

// PHP 8+ recipe, not an executed server fixture. Include before all output.
// Set WEBGUARD_HEADERS_FILE to a trusted file OUTSIDE the public document root.
function applyWebGuardHeaders(): void
{
    $file = getenv('WEBGUARD_HEADERS_FILE');
    if ($file === false || $file === '' || !is_file($file) || !is_readable($file)) {
        throw new RuntimeException('WebGuard policy file is missing or unreadable');
    }
    $policy = json_decode(file_get_contents($file), false, 512, JSON_THROW_ON_ERROR);
    if (!$policy instanceof stdClass || count(get_object_vars($policy)) === 0) {
        throw new RuntimeException('WebGuard policy must be a nonempty JSON object');
    }
    $allowed = [
        'content-security-policy', 'content-security-policy-report-only',
        'x-content-type-options', 'referrer-policy', 'permissions-policy',
        'cross-origin-opener-policy', 'cross-origin-resource-policy',
        'cross-origin-embedder-policy', 'strict-transport-security', 'x-frame-options',
    ];
    $validated = [];
    foreach ($policy as $name => $value) {
        if (!in_array(strtolower($name), $allowed, true) ||
            !is_string($value) || preg_match('/[\x00-\x1f\x7f]/', $value)) {
            throw new RuntimeException('Invalid WebGuard response policy');
        }
        $validated[$name] = $value;
    }
    if (!isset($validated['Content-Security-Policy'])) {
        throw new RuntimeException('WebGuard CSP is required');
    }
    if (headers_sent()) {
        throw new RuntimeException('WebGuard headers must precede response output');
    }
    foreach ($validated as $name => $value) {
        header($name . ': ' . $value, true);
    }
}

applyWebGuardHeaders();
