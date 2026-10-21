<?php
// PHP 8 example router; php -S is a development server, not a production host.
declare(strict_types=1);
$root = getenv('WEBGUARD_SSR_OUTPUT') ?: __DIR__ . '/../../../.demo-dist/ssr-templates';
$base = getenv('WEBGUARD_BASE_PATH') ?: '/';
if (!preg_match('~^/(?:[a-zA-Z0-9_-]+/)*$~D', $base)) {
    throw new RuntimeException('WEBGUARD_BASE_PATH must be / or /safe-prefix/');
}
$policy = json_decode(file_get_contents($root . '/private/policy.json'), true, 512, JSON_THROW_ON_ERROR);
foreach ($policy['headers'] as $name => $value) {
    header($name . ': ' . $value);
}
$escape = static fn(string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
$method = $_SERVER['REQUEST_METHOD'];
$status = 404;
$type = 'text/plain; charset=utf-8';
$body = 'Not found';
if (!in_array($method, ['GET', 'HEAD'], true)) {
    $status = 405;
    $body = 'Method not allowed';
    header('Allow: GET, HEAD');
} elseif ($path === $base) {
    $name = is_string($_GET['name'] ?? null) ? substr($_GET['name'], 0, 200) : 'WebGuard';
    $tags = [];
    foreach ($policy['assets'] as $filename => $asset) {
        $url = $escape($base . 'assets/' . $filename);
        $integrity = $escape($asset['integrity']);
        $tags[] = str_ends_with($filename, '.css')
            ? '<link rel="stylesheet" href="' . $url . '" integrity="' . $integrity . '" crossorigin="anonymous">'
            : '<script src="' . $url . '" defer integrity="' . $integrity . '" crossorigin="anonymous"></script>';
    }
    $body = strtr(file_get_contents($root . '/private/template.html'), [
        '{{runtime}}' => 'PHP',
        '{{greeting}}' => $escape($name),
        '{{requestId}}' => bin2hex(random_bytes(16)),
        '{{assets}}' => implode("\n", $tags),
        '{{apiUrl}}' => $escape($base . 'api/status'),
    ]);
    $status = 200;
    $type = 'text/html; charset=utf-8';
} elseif ($path === $base . 'api/status') {
    $body = json_encode(['runtime' => 'PHP', 'requestId' => bin2hex(random_bytes(16))], JSON_THROW_ON_ERROR);
    $status = 200;
    $type = 'application/json; charset=utf-8';
} elseif (str_starts_with($path, $base . 'assets/')) {
    $filename = substr($path, strlen($base . 'assets/'));
    if (array_key_exists($filename, $policy['assets'])) {
        $body = file_get_contents($root . '/public/assets/' . $filename);
        $status = 200;
        $type = $policy['assets'][$filename]['type'];
    }
}
http_response_code($status);
header('Content-Type: ' . $type);
header('Content-Length: ' . strlen($body));
if ($method !== 'HEAD') {
    echo $body;
}
// Always handle the request: never fall through to the PHP static file server.
return true;
