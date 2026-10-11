<?php
declare(strict_types=1);

/*
 * Однофайловый бэкенд кабинета конечного клиента.
 *
 * Задача: собрать заказы со всех электронных площадок (адаптеры) в единый
 * канонический вид и дать клиенту управлять ими (подтверждение, отклонение,
 * документы, отметка проблемы). Сейчас подключены seeded mock-адаптеры; чтобы
 * подключить реальную площадку, достаточно реализовать PlatformAdapter.
 *
 * Секреты (логин/пароль клиента) читаются из:
 *   1) переменных окружения LOGUS_USER / LOGUS_PASSWORD / LOGUS_PASSWORD_HASH
 *   2) файла private/secrets.php (см. private/secrets.example.php)
 */

const CACHE_TTL_SECONDS = 300;
const MAX_PAGE = 200;
const DIAG_RATE_WINDOW = 3600;
const DIAG_RATE_LIMIT = 60;
const DIAG_MAX_FILES = 500;
const DIAG_MAX_AGE_DAYS = 30;

/* Статусы заказа в жизненном цикле (индекс = порядок). */
const ORDER_FLOW = [
    'created',
    'carrier_assigned',
    'confirmed',
    'loading',
    'in_transit',
    'unloading',
    'delivered',
    'closed',
];

const PLATFORMS = [
    'ati'     => 'ATI.SU',
    'loginet' => 'Loginet',
    'own'     => 'Своя площадка',
];

/* ---------------------------------------------------------------- helpers */

function json_out(array $data, int $status = 200): never
{
    @ini_set('zlib.output_compression', '0');
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE;
    $json = json_encode($data, $flags);
    if ($json === false) {
        $json = '{"error":{"code":"ENCODE_FAILED","message":"Не удалось сериализовать ответ","details":null}}';
        $status = 500;
    }

    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-transform');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header('X-Frame-Options: DENY');
    header('X-Request-Id: ' . request_id());
    header('Vary: Accept-Encoding');

    $acceptsGzip = stripos((string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip') !== false;
    if ($acceptsGzip && function_exists('gzencode')) {
        $body = (string) gzencode($json, 6);
        header('Content-Encoding: gzip');
    } else {
        $body = $json;
    }
    header('Content-Length: ' . strlen($body));
    echo $body;
    exit;
}

function fail(int $status, string $code, string $message, array $details = []): never
{
    json_out(['error' => ['code' => $code, 'message' => $message, 'details' => $details ?: null]], $status);
}

/* Сквозной идентификатор запроса: уходит заголовком X-Request-Id и в лог ошибок. */
function request_id(): string
{
    static $id = null;
    if ($id === null) {
        $id = bin2hex(random_bytes(8));
    }
    return $id;
}

function request_body(): array
{
    $raw = (string) file_get_contents('php://input');
    if ($raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        fail(405, 'METHOD_NOT_ALLOWED', 'Это действие доступно только методом ' . $method);
    }
}

/*
 * Проверка своего origin для изменяющих запросов — базовая защита от CSRF.
 * Если браузер не прислал Origin/Referer (CLI, curl) — не блокируем.
 */
function assert_same_origin(): void
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') {
        $origin = (string) ($_SERVER['HTTP_REFERER'] ?? '');
    }
    if ($origin === '') {
        return;
    }
    $parts = parse_url($origin);
    if (!is_array($parts) || !isset($parts['host'])) {
        fail(403, 'BAD_ORIGIN', 'Запрос с некорректного источника отклонён');
    }
    $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
    $originHost = $parts['host'] . (isset($parts['port']) ? ':' . (int) $parts['port'] : '');
    if ($host !== '' && !hash_equals($host, $originHost)) {
        fail(403, 'CROSS_ORIGIN', 'Запрос с другого сайта отклонён');
    }
}

/* ---------------------------------------------------------------- secrets */

function load_secrets(): array
{
    $env = function (string $name): ?string {
        $value = getenv($name);
        return ($value === false || $value === '') ? null : $value;
    };

    $file = __DIR__ . '/private/secrets.php';
    $fromFile = [];
    if (is_file($file)) {
        $loaded = include $file;
        if (is_array($loaded)) {
            $fromFile = $loaded;
        }
    }

    if (($user = $env('LOGUS_USER')) !== null) {
        $fromFile['username'] = $user;
    }
    if (($pass = $env('LOGUS_PASSWORD')) !== null) {
        $fromFile['password'] = $pass;
    }
    if (($hash = $env('LOGUS_PASSWORD_HASH')) !== null) {
        $fromFile['password_hash'] = $hash;
    }

    return $fromFile;
}

function secrets_ready(array $s): bool
{
    $hasUser = isset($s['username']) && $s['username'] !== '';
    $hasPass = (isset($s['password_hash']) && $s['password_hash'] !== '')
        || (isset($s['password']) && $s['password'] !== '');
    return $hasUser && $hasPass;
}

function verify_credentials(array $s, string $username, string $password): bool
{
    $expected = (string) ($s['username'] ?? '');
    if ($username === '' || $expected === '' || !hash_equals($expected, $username)) {
        return false;
    }
    if (isset($s['password_hash']) && $s['password_hash'] !== '') {
        return password_verify($password, (string) $s['password_hash']);
    }
    if (isset($s['password']) && is_string($s['password'])) {
        return hash_equals($s['password'], $password);
    }
    return false;
}

/* ---------------------------------------------------------------- session */

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    if (session_name('LOGUSSESS')) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        ]);
    }
    session_start();
}

function require_auth(): void
{
    start_session();
    if (empty($_SESSION['logus_authorized'])) {
        fail(401, 'UNAUTHORIZED', 'Требуется вход');
    }
    // Освобождаем файл сессии до дальнейшей работы, чтобы параллельные
    // запросы того же клиента не ждали блокировку.
    session_write_close();
}

/* ---------------------------------------------------------------- cache */

function cache_path(string $key): string
{
    return __DIR__ . '/private/cache/' . $key . '.json';
}

function cache_get(string $key): ?array
{
    $path = cache_path($key);
    if (!is_file($path) || time() - (int) filemtime($path) > CACHE_TTL_SECONDS) {
        return null;
    }
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function cache_put(string $key, array $data): void
{
    $dir = dirname(cache_path($key));
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return;
    }
    $json = json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR,
    );
    if (!is_string($json)) {
        return; // не затираем валидный кэш сбойным результатом
    }
    @file_put_contents(cache_path($key), $json, LOCK_EX);
}

/* Состояние, изменённое клиентом (действия по заказам) — поверх mock-данных. */
function state_path(): string
{
    return __DIR__ . '/private/cache/state.json';
}

function state_load(): array
{
    $path = state_path();
    if (!is_file($path)) {
        return ['orders' => [], 'notificationsRead' => []];
    }
    $data = json_decode((string) file_get_contents($path), true);
    if (!is_array($data)) {
        return ['orders' => [], 'notificationsRead' => []];
    }
    $data['orders'] ??= [];
    $data['notificationsRead'] ??= [];
    return $data;
}

function state_save(array $state): void
{
    $dir = dirname(state_path());
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return;
    }
    $json = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    if (!is_string($json)) {
        return;
    }
    @file_put_contents(state_path(), $json, LOCK_EX);
}

/* ---------------------------------------------------------------- adapters */

require __DIR__ . '/private/seed.php';

interface PlatformAdapter
{
    public function code(): string;
    public function title(): string;
    /** @return array<int, array<string, mixed>> канонические заказы */
    public function fetchOrders(): array;
}

/* Режим мок-площадок для тестов/демо: normal | empty | error | slow. */
function mock_mode(): string
{
    static $mode = null;
    if ($mode === null) {
        $env = getenv('LOGUS_MOCK_MODE');
        $mode = is_string($env) && $env !== '' ? $env : 'normal';
    }
    return $mode;
}

/*
 * Mock-адаптер: отдаёт seeded-заказы площадки, приведённые к каноническому
 * виду. Реальный коннектор заменит только fetchOrders(), структура сохранится.
 */
abstract class MockAdapter implements PlatformAdapter
{
    public function title(): string
    {
        return PLATFORMS[$this->code()] ?? $this->code();
    }

    public function fetchOrders(): array
    {
        $mode = mock_mode();
        if ($mode === 'slow') {
            usleep(1500000);
        }
        if ($mode === 'empty') {
            return [];
        }
        if ($mode === 'error') {
            throw new RuntimeException('площадка недоступна (тестовый режим)');
        }
        $out = [];
        foreach (Seed::orders($this->code()) as $raw) {
            $out[] = $this->normalize($raw);
        }
        return $out;
    }

    private function normalize(array $r): array
    {
        $created = time() - (int) $r['createdDaysAgo'] * 86400;
        $load = time() + (int) $r['loadInDays'] * 86400;
        $transitHours = (int) $r['transitHours'];
        $status = (string) $r['status'];
        $deviation = $r['deviation'] ?? null;

        $events = build_timeline($status, $created, $load, $transitHours, is_array($deviation) ? $deviation : null);
        $orderId = $this->code() . '-' . (string) $r['sourceOrderId'];

        $eta = null;
        if (in_array($status, ['loading', 'in_transit', 'unloading'], true)) {
            $eta = iso($load + $transitHours * 3600);
        }

        return [
            'id'              => $orderId,
            'source'          => $this->code(),
            'sourceTitle'     => $this->title(),
            'sourceOrderId'   => (string) $r['sourceOrderId'],
            'status'          => $status,
            'createdAt'       => iso($created),
            'statusUpdatedAt' => $events === [] ? iso($created) : $events[count($events) - 1]['at'],
            'route'           => [
                'from' => ['city' => $r['fromCity'], 'address' => $r['fromAddress']],
                'to'   => ['city' => $r['toCity'], 'address' => $r['toAddress']],
            ],
            'cargo'           => [
                'name'     => $r['cargo'],
                'weightKg' => (int) $r['weightKg'],
                'volumeM3' => (float) $r['volumeM3'],
                'places'   => (int) $r['places'],
                'bodyType' => $r['bodyType'],
            ],
            'dates'           => [
                'loadAt'   => iso($load),
                'unloadAt' => iso($load + $transitHours * 3600),
                'eta'      => $eta,
            ],
            'price'           => [
                'amount'   => (int) $r['price'],
                'currency' => 'RUB',
                'vat'      => $r['vat'],
            ],
            'counterparty'    => [
                'carrierName'    => $r['carrierName'],
                'carrierContact' => $r['carrierContact'],
                'carrierRating'  => (float) $r['carrierRating'],
            ],
            'events'          => $events,
            'docs'            => default_docs($status),
            'flags'           => [
                'deviation' => $deviation,
                'problem'   => $status === 'problem' ? ($r['problemReason'] ?? 'Требуется внимание клиента') : null,
            ],
        ];
    }
}

final class AtiAdapter extends MockAdapter
{
    public function code(): string
    {
        return 'ati';
    }
}

final class LoginetAdapter extends MockAdapter
{
    public function code(): string
    {
        return 'loginet';
    }
}

final class OwnAdapter extends MockAdapter
{
    public function code(): string
    {
        return 'own';
    }
}

function iso(int $ts): string
{
    return gmdate('Y-m-d\TH:i:s\Z', $ts);
}

function default_docs(string $status): array
{
    $idx = array_search($status, ORDER_FLOW, true);
    $idx = $idx === false ? 0 : (int) $idx;
    return [
        ['id' => 'contract', 'title' => 'Договор-заявка', 'status' => 'ok', 'url' => null],
        ['id' => 'waybill',  'title' => 'Транспортная накладная', 'status' => $idx >= 3 ? 'ok' : 'wait', 'url' => null],
        ['id' => 'pod',      'title' => 'Документы о выгрузке (ПОД)', 'status' => $idx >= 6 ? 'ok' : 'wait', 'url' => null],
        ['id' => 'invoice',  'title' => 'Счёт на оплату', 'status' => 'ok', 'url' => null],
    ];
}

/* Канонический таймлайн: события до текущего статуса включительно. */
function build_timeline(string $status, int $created, int $load, int $transitHours, ?array $deviation): array
{
    $label = static function (string $code): string {
        return match ($code) {
            'created'          => 'Заказ создан на площадке',
            'carrier_assigned' => 'Назначен перевозчик',
            'confirmed'        => 'Заказ подтверждён клиентом',
            'loading'          => 'Погрузка начата',
            'in_transit'       => 'Груз в пути',
            'unloading'        => 'Выгрузка начата',
            'delivered'        => 'Груз доставлен',
            'closed'           => 'Документы закрыты',
            'cancelled'        => 'Заказ отменён',
            'problem'          => 'Отклонение «план–факт»',
            'request_change'   => 'Запрошено изменение',
            default            => $code,
        };
    };
    $mk = static fn(string $code, int $at, ?string $note = null): array =>
        ['code' => $code, 'label' => $label($code), 'at' => iso($at), 'note' => $note];

    if ($status === 'cancelled') {
        return [$mk('created', $created), $mk('cancelled', $created + 7200)];
    }
    if ($status === 'problem') {
        $seq = [
            $mk('created', $created),
            $mk('carrier_assigned', $created + 3600 * 3),
            $mk('confirmed', $created + 3600 * 5),
            $mk('loading', $load),
            $mk('in_transit', $load + 3600),
        ];
        $note = $deviation['reason'] ?? 'Ожидается решение клиента';
        return [...$seq, $mk('problem', $load + 3600 * 6, $note)];
    }

    $idx = array_search($status, ORDER_FLOW, true);
    $idx = $idx === false ? 0 : (int) $idx;

    $times = [
        $created,
        $created + 3600 * 3,
        $created + 3600 * 5,
        $load,
        $load + 3600,
        $load + $transitHours * 3600,
        $load + $transitHours * 3600 + 3600 * 2,
        $load + $transitHours * 3600 + 3600 * 26,
    ];
    $events = [];
    foreach (ORDER_FLOW as $i => $code) {
        if ($i > $idx) {
            break;
        }
        $events[] = $mk($code, $times[$i]);
    }
    if ($deviation !== null && $idx >= 4) {
        $events[] = $mk('problem', $load + 3600 * 4, (string) ($deviation['reason'] ?? 'Ожидается задержка'));
    }
    return $events;
}

/* Фабрика адаптеров — сюда добавляются реальные коннекторы площадок. */
function adapters(): array
{
    return [
        new AtiAdapter(),
        new LoginetAdapter(),
        new OwnAdapter(),
    ];
}

/* Сбор заказов со всех площадок с кэшированием по площадке. */
function collect_all_orders(bool $refresh = false): array
{
    $orders = [];
    foreach (adapters() as $adapter) {
        $code = $adapter->code();
        try {
            $cached = $refresh ? null : cache_get('platform-' . $code);
            if ($cached === null) {
                $cached = $adapter->fetchOrders();
                cache_put('platform-' . $code, $cached);
            }
        } catch (Throwable $e) {
            // Одна площадка недоступна — не роняем весь кабинет, просто пропускаем.
            log_error('адаптер ' . $code . ' недоступен', $e);
            continue;
        }
        foreach ($cached as $order) {
            $orders[] = $order;
        }
    }
    // Свежие сверху: по времени изменения статуса.
    usort($orders, static fn(array $a, array $b): int => strcmp($b['statusUpdatedAt'], $a['statusUpdatedAt']));
    return $orders;
}

/* Наложение изменённого клиентом состояния поверх канонических заказов. */
function apply_state(array $orders, array $state): array
{
    foreach ($orders as &$order) {
        $patch = $state['orders'][$order['id']] ?? null;
        if (!is_array($patch)) {
            continue;
        }
        if (isset($patch['status']) && is_string($patch['status'])) {
            $order['status'] = $patch['status'];
        }
        if (isset($patch['events']) && is_array($patch['events'])) {
            $order['events'] = array_merge($order['events'], $patch['events']);
        }
        if (isset($patch['docs']) && is_array($patch['docs'])) {
            $order['docs'] = array_merge($order['docs'], $patch['docs']);
        }
        if (isset($patch['problem'])) {
            $order['flags']['problem'] = $patch['problem'];
        }
        if (isset($patch['deviation'])) {
            $order['flags']['deviation'] = $patch['deviation'];
        }
    }
    unset($order);
    return $orders;
}

function find_order(string $id, bool $refresh = false): ?array
{
    foreach (collect_all_orders($refresh) as $order) {
        if ($order['id'] === $id) {
            return $order;
        }
    }
    return null;
}

function notifications_from_orders(array $orders, array $state): array
{
    $items = [];
    foreach ($orders as $order) {
        $events = $order['events'];
        if ($events === []) {
            continue;
        }
        foreach (array_slice($events, -2) as $event) {
            $code = (string) ($event['code'] ?? '');
            $tone = 'info';
            if ($code === 'problem') {
                $tone = 'danger';
            } elseif ($code === 'delivered' || $code === 'closed' || $code === 'confirmed') {
                $tone = 'ok';
            } elseif ($code === 'request_change') {
                $tone = 'warn';
            }
            $nid = $order['id'] . ':' . ($event['at'] ?? '') . ':' . $code;
            $items[] = [
                'id'       => $nid,
                'orderId'  => $order['id'],
                'orderNum' => order_num($order),
                'title'    => (string) ($event['label'] ?? $code),
                'body'     => trim(order_route($order) . (($event['note'] ?? '') !== '' ? ' — ' . $event['note'] : '')),
                'at'       => (string) ($event['at'] ?? $order['statusUpdatedAt']),
                'tone'     => $tone,
                'read'     => !empty($state['notificationsRead'][$nid]),
            ];
        }
    }
    usort($items, static fn(array $a, array $b): int => strcmp($b['at'], $a['at']));
    return array_slice($items, 0, 30);
}

function order_num(array $order): string
{
    $map = ['ati' => 'ATI', 'loginet' => 'LG', 'own' => 'СП'];
    return ($map[$order['source']] ?? strtoupper((string) $order['source'])) . '-' . $order['sourceOrderId'];
}

function order_route(array $order): string
{
    return $order['route']['from']['city'] . ' → ' . $order['route']['to']['city'];
}

/* ---------------------------------------------------------------- actions */

function action_session(array $s): void
{
    start_session();
    // Сессия намеренно быстрая: не трогаем внешние площадки, иначе медленный
    // коннектор тормозит даже экран входа. Данные площадок — через platforms.
    json_out([
        'authorized'    => !empty($_SESSION['logus_authorized']),
        'setupRequired' => !secrets_ready($s),
        'user'          => !empty($_SESSION['logus_authorized']) ? (string) ($_SESSION['logus_user'] ?? '') : null,
    ]);
}

function action_login(array $s): void
{
    assert_same_origin();
    require_method('POST');
    start_session();

    if (!secrets_ready($s)) {
        fail(503, 'NOT_CONFIGURED', 'Сервер не настроен: заполните private/secrets.php');
    }

    $body = request_body();
    $username = is_string($body['username'] ?? null) ? trim($body['username']) : '';
    $password = is_string($body['password'] ?? null) ? $body['password'] : '';

    $fails = (int) ($_SESSION['logus_login_fails'] ?? 0);
    if ($fails >= 5) {
        fail(429, 'TOO_MANY_ATTEMPTS', 'Слишком много попыток входа. Подождите минуту.');
    }

    if (!verify_credentials($s, $username, $password)) {
        $_SESSION['logus_login_fails'] = $fails + 1;
        usleep(250_000);
        fail(401, 'BAD_CREDENTIALS', 'Неверный логин или пароль');
    }

    unset($_SESSION['logus_login_fails']);
    $_SESSION['logus_authorized'] = true;
    $_SESSION['logus_user'] = $username;
    session_regenerate_id(true);
    json_out(['authorized' => true, 'user' => $username]);
}

function action_logout(): void
{
    assert_same_origin();
    require_method('POST');
    start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $params['path'],
            'domain'   => $params['domain'],
            'secure'   => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'] !== '' ? $params['samesite'] : 'Lax',
        ]);
    }
    session_destroy();
    json_out(['authorized' => false]);
}

function action_orders(): void
{
    require_auth();
    $state = state_load();
    $orders = apply_state(collect_all_orders(), $state);

    $platform = (string) ($_GET['platform'] ?? '');
    $status = (string) ($_GET['status'] ?? '');
    $q = trim((string) ($_GET['q'] ?? ''));
    $page = filter_var($_GET['page'] ?? 1, FILTER_VALIDATE_INT, ['options' => ['default' => 1, 'min_range' => 1]]);
    $limit = filter_var($_GET['limit'] ?? 20, FILTER_VALIDATE_INT, ['options' => ['default' => 20, 'min_range' => 1, 'max_range' => MAX_PAGE]]);

    $filtered = array_values(array_filter($orders, static function (array $o) use ($platform, $status, $q): bool {
        if ($platform !== '' && $o['source'] !== $platform) {
            return false;
        }
        if ($status !== '' && $o['status'] !== $status) {
            return false;
        }
        if ($q !== '') {
            $hay = mb_strtolower_ru(order_num($o) . ' ' . order_route($o) . ' ' . $o['cargo']['name'] . ' ' . $o['counterparty']['carrierName']);
            if (strpos($hay, mb_strtolower_ru($q)) === false) {
                return false;
            }
        }
        return true;
    }));

    $total = count($filtered);
    $page = is_int($page) ? $page : 1;
    $limit = is_int($limit) ? $limit : 20;
    $slice = array_slice($filtered, ($page - 1) * $limit, $limit);

    json_out([
        'items'   => $slice,
        'page'    => $page,
        'limit'   => $limit,
        'total'   => $total,
        'hasMore' => $page * $limit < $total,
        'summary' => order_summary($orders),
    ]);
}

function action_order(): void
{
    require_auth();
    $id = trim((string) ($_GET['id'] ?? ''));
    if ($id === '') {
        fail(400, 'VALIDATION_FAILED', 'Не указан id заказа');
    }
    $state = state_load();
    $order = find_order($id);
    if ($order === null) {
        fail(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
    }
    $order = apply_state([$order], $state)[0];
    json_out(['order' => $order]);
}

function action_order_action(): void
{
    require_auth();
    assert_same_origin();
    require_method('POST');

    $body = request_body();
    $id = is_string($body['id'] ?? null) ? trim($body['id']) : '';
    $act = is_string($body['action'] ?? null) ? $body['action'] : '';
    $note = is_string($body['note'] ?? null) ? trim($body['note']) : '';

    // Отметка уведомления прочитанным не привязана к конкретному заказу.
    if ($act === 'ack_notification') {
        $nid = is_string($body['notifyId'] ?? null) ? $body['notifyId'] : '';
        if ($nid !== '') {
            $s = state_load();
            $s['notificationsRead'][$nid] = true;
            state_save($s);
        }
        json_out(['ok' => true]);
    }

    if ($id === '' || $act === '') {
        fail(400, 'VALIDATION_FAILED', 'Нужны id и action');
    }

    $order = find_order($id);
    if ($order === null) {
        fail(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
    }

    $now = time();
    $event = static fn(string $code, string $label, ?string $n = null): array =>
        ['code' => $code, 'label' => $label, 'at' => iso($now), 'note' => $n];

    $state = state_load();
    $patch = $state['orders'][$id] ?? [];
    $patch['events'] ??= [];
    $patch['docs'] ??= [];
    $current = $patch['status'] ?? $order['status'];

    switch ($act) {
        case 'confirm':
            if (!in_array($current, ['created', 'carrier_assigned'], true)) {
                fail(409, 'BAD_STATE', 'Подтвердить можно только заказ, ожидающий решения перевозчика');
            }
            $patch['status'] = 'confirmed';
            $patch['events'][] = $event('confirmed', 'Заказ подтверждён клиентом', $note ?: null);
            break;

        case 'reject':
            if (in_array($current, ['delivered', 'closed', 'cancelled'], true)) {
                fail(409, 'BAD_STATE', 'Нельзя отменить уже завершённый заказ');
            }
            $patch['status'] = 'cancelled';
            $patch['events'][] = $event('cancelled', 'Заказ отменён клиентом', $note ?: null);
            break;

        case 'request_change':
            $patch['events'][] = $event('request_change', 'Запрошено изменение', $note ?: 'Уточнение условий');
            break;

        case 'report_problem':
            $patch['status'] = 'problem';
            $patch['problem'] = $note ?: 'Клиент сообщил о проблеме';
            $patch['events'][] = $event('problem', 'Отклонение «план–факт»', $note ?: null);
            break;

        case 'resolve_problem':
            if ($current !== 'problem') {
                fail(409, 'BAD_STATE', 'Заказ не в состоянии проблемы');
            }
            $patch['status'] = 'in_transit';
            $patch['problem'] = null;
            $patch['events'][] = $event('in_transit', 'Проблема урегулирована', $note ?: null);
            break;

        case 'mark_received':
            if (!in_array($current, ['delivered'], true)) {
                fail(409, 'BAD_STATE', 'Закрыть можно только доставленный заказ');
            }
            $patch['status'] = 'closed';
            $patch['events'][] = $event('closed', 'Документы закрыты', $note ?: null);
            break;

        case 'upload_doc':
            $docType = is_string($body['docType'] ?? null) && $body['docType'] !== '' ? $body['docType'] : 'document';
            $patch['docs'][] = [
                'id'     => 'up-' . bin2hex(random_bytes(4)),
                'title'  => 'Загруженный документ: ' . $docType,
                'status' => 'ok',
                'url'    => null,
            ];
            $patch['events'][] = $event('doc_uploaded', 'Клиент загрузил документ', $docType);
            break;

        default:
            fail(400, 'UNKNOWN_ACTION', 'Неизвестное действие: ' . $act);
    }

    $state['orders'][$id] = $patch;
    state_save($state);

    $updated = find_order($id);
    $updated = $updated === null ? null : apply_state([$updated], $state)[0];
    json_out(['ok' => true, 'order' => $updated]);
}

function action_notifications(): void
{
    require_auth();
    $state = state_load();
    $orders = apply_state(collect_all_orders(), $state);
    $items = notifications_from_orders($orders, $state);
    json_out([
        'items'  => $items,
        'unread' => count(array_filter($items, static fn(array $n): bool => empty($n['read']))),
    ]);
}

function action_platforms(): void
{
    require_auth();
    json_out(['items' => platform_list()]);
}

function platform_list(): array
{
    $state = state_load();
    $orders = apply_state(collect_all_orders(), $state);
    $items = [];
    foreach (PLATFORMS as $code => $title) {
        $count = count(array_filter($orders, static fn(array $o): bool => $o['source'] === $code));
        $items[] = [
            'code'     => $code,
            'title'    => $title,
            'count'    => $count,
            'connected' => true,
            'lastSync' => load_sync_time(),
        ];
    }
    return $items;
}

function load_sync_time(): ?string
{
    $path = __DIR__ . '/private/cache/lastsync.json';
    if (!is_file($path)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) && isset($data['at']) ? (string) $data['at'] : null;
}

function action_sync(): void
{
    require_auth();
    assert_same_origin();
    require_method('POST');

    // Обновляем кэш площадок (в реальном коннекторе здесь был бы сетевой вызов).
    collect_all_orders(true);

    $dir = __DIR__ . '/private/cache';
    if (is_dir($dir) || @mkdir($dir, 0775, true) || is_dir($dir)) {
        @file_put_contents($dir . '/lastsync.json', (string) json_encode(['at' => iso(time())]), LOCK_EX);
    }

    json_out(['ok' => true, 'syncedAt' => iso(time()), 'platforms' => platform_list()]);
}

function order_summary(array $orders): array
{
    $summary = ['total' => count($orders), 'inTransit' => 0, 'problems' => 0, 'delivered' => 0, 'awaiting' => 0];
    foreach ($orders as $o) {
        $s = $o['status'];
        if (in_array($s, ['loading', 'in_transit', 'unloading'], true)) {
            $summary['inTransit']++;
        }
        if ($s === 'problem') {
            $summary['problems']++;
        }
        if (in_array($s, ['delivered', 'closed'], true)) {
            $summary['delivered']++;
        }
        if (in_array($s, ['created', 'carrier_assigned'], true)) {
            $summary['awaiting']++;
        }
    }
    return $summary;
}

/* mbstring может отсутствовать — держим регистронезависимое сравнение кириллицы. */
function mb_strtolower_ru(string $s): string
{
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($s, 'UTF-8');
    }
    return strtr($s, 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя');
}

/* ---------------------------------------------------------------- static assets */

function action_asset(): never
{
    @ini_set('zlib.output_compression', '0');
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    $name = (string) ($_GET['f'] ?? '');
    if (preg_match('/^app-[A-Za-z0-9._-]+\.(js|css)$/', $name) !== 1) {
        fail(400, 'BAD_ASSET', 'Недопустимое имя файла');
    }

    $assetsDir = realpath(__DIR__ . '/assets');
    $real = realpath(__DIR__ . '/assets/' . $name);
    if ($assetsDir === false || $real === false || strpos($real, $assetsDir . DIRECTORY_SEPARATOR) !== 0 || !is_file($real)) {
        fail(404, 'ASSET_NOT_FOUND', 'Файл не найден');
    }

    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $contentType = $ext === 'css' ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8';
    $body = (string) file_get_contents($real);
    $etag = '"' . sha1_file($real) . '"';

    header('Content-Type: ' . $contentType);
    header('Cache-Control: public, max-age=31536000, immutable, no-transform');
    header('X-Content-Type-Options: nosniff');
    header('Vary: Accept-Encoding');
    header('ETag: ' . $etag);

    if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
        http_response_code(304);
        exit;
    }

    $acceptsGzip = stripos((string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip') !== false;
    if ($acceptsGzip && function_exists('gzencode')) {
        $cacheDir = __DIR__ . '/private/asset-cache';
        $gzPath = $cacheDir . '/' . $name . '.gz';
        if (!is_file($gzPath) && (@mkdir($cacheDir, 0775, true) || is_dir($cacheDir))) {
            @file_put_contents($gzPath, gzencode($body, 9), LOCK_EX);
        }
        if (is_file($gzPath)) {
            $body = (string) file_get_contents($gzPath);
            header('Content-Encoding: gzip');
        }
    }

    header('Content-Length: ' . strlen($body));
    echo $body;
    exit;
}

/* ---------------------------------------------------------------- diagnostics */

function action_diag(): never
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    if (diag_rate_limited($ip)) {
        fail(429, 'RATE_LIMITED', 'Слишком много диагностических запросов');
    }

    $raw = (string) file_get_contents('php://input');
    if (strlen($raw) > 262144) {
        $raw = substr($raw, 0, 262144);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = ['raw' => $raw];
    }
    $data['_server'] = [
        'time'            => date('c'),
        'request_id'      => request_id(),
        'ip'              => $_SERVER['REMOTE_ADDR'] ?? null,
        'user_agent'      => $_SERVER['HTTP_USER_AGENT'] ?? null,
        'accept_encoding' => $_SERVER['HTTP_ACCEPT_ENCODING'] ?? null,
        'http_version'    => $_SERVER['SERVER_PROTOCOL'] ?? null,
    ];

    $dir = __DIR__ . '/private/diag';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        json_out(['ok' => false, 'error' => 'no_dir']);
    }
    $file = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.json';
    @file_put_contents(
        $dir . '/' . $file,
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
        LOCK_EX,
    );
    diag_prune($dir);
    json_out(['ok' => true, 'file' => $file, 'request_id' => request_id()]);
}

function diag_rate_limited(string $ip): bool
{
    $dir = __DIR__ . '/private/diag';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return false;
    }
    $now = time();
    $key = substr(hash('sha256', $ip), 0, 16);
    $path = $dir . '/ratelimit.json';
    $fp = @fopen($path, 'c+');
    if ($fp === false || !flock($fp, LOCK_EX)) {
        if ($fp !== false) {
            fclose($fp);
        }
        return false;
    }
    $raw = stream_get_contents($fp);
    $data = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
    if (!is_array($data)) {
        $data = [];
    }
    $hits = [];
    foreach ((array) ($data[$key] ?? []) as $t) {
        if (is_int($t) && $now - $t < DIAG_RATE_WINDOW) {
            $hits[] = $t;
        }
    }
    $limited = count($hits) >= DIAG_RATE_LIMIT;
    if (!$limited) {
        $hits[] = $now;
    }
    $data = [$key => $hits];
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string) json_encode($data));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $limited;
}

function diag_prune(string $dir): void
{
    $files = glob($dir . '/*.json');
    if (!is_array($files)) {
        return;
    }
    $now = time();
    $items = [];
    foreach ($files as $f) {
        if (basename($f) === 'ratelimit.json') {
            continue;
        }
        $mtime = @filemtime($f) ?: 0;
        if ($mtime > 0 && $now - $mtime > DIAG_MAX_AGE_DAYS * 86400) {
            @unlink($f);
            continue;
        }
        $items[] = [$mtime, $f];
    }
    if (count($items) <= DIAG_MAX_FILES) {
        return;
    }
    usort($items, static fn(array $a, array $b): int => $a[0] <=> $b[0]);
    $excess = count($items) - DIAG_MAX_FILES;
    for ($i = 0; $i < $excess; $i++) {
        @unlink($items[$i][1]);
    }
}

/* ---------------------------------------------------------------- router */

$secrets = load_secrets();
$action = $_GET['action'] ?? 'session';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    json_out([]);
}

try {
    switch ($action) {
        case 'asset':
            action_asset();
        case 'diag':
            action_diag();
        case 'session':
            action_session($secrets);
        case 'login':
            action_login($secrets);
        case 'logout':
            action_logout();
        case 'orders':
            action_orders();
        case 'order':
            action_order();
        case 'order_action':
            action_order_action();
        case 'notifications':
            action_notifications();
        case 'platforms':
            action_platforms();
        case 'sync':
            action_sync();
        default:
            fail(404, 'UNKNOWN_ACTION', 'Неизвестное действие');
    }
} catch (Throwable $e) {
    log_error((string) $action, $e);
    fail(500, 'INTERNAL', 'Внутренняя ошибка сервера');
}

function log_error(string $logAction, Throwable $e): void
{
    $dir = __DIR__ . '/private/diag';
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return;
    }
    $entry = json_encode([
        'time'       => date('c'),
        'request_id' => request_id(),
        'action'     => $logAction,
        'class'      => get_class($e),
        'message'    => $e->getMessage(),
        'file'       => $e->getFile(),
        'line'       => $e->getLine(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    $path = $dir . '/errors.log';
    if (is_file($path) && filesize($path) > 1048576) {
        @rename($path, $dir . '/errors.old.log');
    }
    @file_put_contents($path, $entry, LOCK_EX | FILE_APPEND);
}
