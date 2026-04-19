# Security Guide v2.0

## Threat model

AegisOps может запускаться в трёх режимах:

1. **Localhost only** (`BIND=127.0.0.1`, по умолчанию) — доступен только с той же машины. Risk: низкий. Auth не обязательна.
2. **LAN** (`BIND=0.0.0.0` без туннеля) — доступен в локальной сети. Risk: средний. Auth обязательна для всех remote IP.
3. **Public** (tunnel активен) — доступен из интернета. Risk: высокий. Каждый запрос должен иметь валидный API-key или JWT.

## Реализованные меры

### Authentication
- **JWT**: `v1.<base64url(payload)>.<base64url(hmac-sha256(payload))>`, TTL 24ч, single-issuer.
- **API-ключи**: 24-байтный crypto-random, base64url-кодированный, хешируются SHA256(secret + key) перед сохранением.
- **Admin password**: scrypt(password, salt=16B, keylen=64B). Сравнение — `crypto.timingSafeEqual`.
- **Localhost bypass**: можно отключить через `AEGISOPS_ENFORCE_LOCAL_AUTH=1`.

### SCADA DMZ (ISA/IEC 62443)

**Критическое обновление v2.0**: Все OPC UA/SCADA соединения изолированы через DMZ-прокси.

Архитектура по Purdue Model:
```
Level 5 (Enterprise) → AegisOps Server
       ↓
Level 3.5 (DMZ) → ScadaDmzProxy
  - Read-only по умолчанию
  - Rate limiting (token bucket)
  - Полный audit trail
  - Emergency stop
       ↓
Level 2-3 (Control) → OPC UA SCADA Server
```

Режимы доступа:
- `read_only` (по умолчанию): только read, browse, subscribe
- `read_write`: + write, call (требует явной конфигурации)
- `admin`: все операции (только для доверенных сред)

Защита:
- **Read-only default**: если DMZ не настроен, автоматически применяется restrictive proxy
- **Rate limiting**: настраиваемый token bucket (по умолчанию 10 req/sec)
- **Node ID validation**: защита от injection через malformed nodeId
- **Write constraints**: проверка диапазонов, safety threshold (1e9)
- **Emergency stop**: мгновенная блокировка через API (`POST /api/dmz/emergency-stop`)
- **Full audit**: каждое действие (авторизованное или заблокированное) логируется

### Credential Encryption (AES-256-GCM)

**Критическое обновление v2.0**: Учётные данные коннекторов зашифрованы.

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key derivation**: HKDF-SHA256 от serverSecret, 256-bit
- **IV**: 12-byte random per encryption
- **Auto-migration**: plaintext auth_payload → encrypted_auth_payload при запуске
- **Zero-out**: после шифрования plaintext поле обнуляется

Предыдущая уязвимость (plaintext в БД) полностью устранена.

### Transport
- **HTTPS (mobile)**: `network_security_config.xml` → cleartextTrafficPermitted="false"
- **Tunnel**: Cloudflare → автоматический TLS. ngrok → тоже TLS.
- **CSP**: жёсткий, `default-src 'self'`, `script-src 'self' 'unsafe-inline'`

### Input validation
- `inputSanitizer` middleware: control chars + prototype pollution defense
- Payload-guard: 10 MB max
- Все SQL-запросы — параметризованы
- **Node ID sanitization**: OPC UA node IDs валидируются по формату (DMZ proxy)

### Rate limiting
- 300 req/мин на комбинацию IP + route-prefix (sliding window)
- **SCADA-specific**: отдельный token bucket rate limiter в DMZ proxy

### Logging
- JSON-line структурированный лог
- **Secret redaction**: автоматическое маскирование секретов
- **Kafka audit stream**: все события публикуются в `aegisops.audit` топик для SIEM интеграции
- **DMZ audit trail**: каждое SCADA действие (allowed/blocked) логируется

### Storage secrets
- **Server secret**: env `AEGISOPS_SECRET` → или автогенерированный (48 байт) в settings
- **Connector credentials**: AES-256-GCM зашифрованы в `connectors.encrypted_auth_payload`
- **Android**: API-key в `flutter_secure_storage` (AES-256, Android KeyStore)

## Рекомендации для production deployment

### Обязательно
- [x] ~~Шифруйте `connectors.auth_payload`~~ — **Реализовано в v2.0** (AES-256-GCM)
- [x] ~~Изолируйте SCADA подключение~~ — **Реализовано в v2.0** (DMZ proxy, ISA/IEC 62443)
- [ ] Установите собственный `AEGISOPS_SECRET` (env)
- [ ] Установите admin password (`POST /api/auth/bootstrap`)
- [ ] Переключитесь на `AEGISOPS_ENFORCE_LOCAL_AUTH=1`
- [ ] Используйте custom Cloudflare Tunnel
- [ ] Настройте DMZ proxy для каждого OPC UA коннектора (`POST /api/dmz/proxies`)
- [ ] Настройте signing для Android release

### Желательно
- [ ] Переход на HTTPS для localhost через self-signed сертификат
- [ ] Интеграция с корпоративным SSO (Azure AD, Keycloak) — OIDC middleware
- [ ] Аудит-логи → SIEM (Splunk, Elastic) через Kafka `aegisops.audit` топик
- [ ] Регулярная ротация `server_secret`
- [ ] TimescaleDB continuous aggregate refresh policies
- [ ] Kafka SSL/SASL для production кластера

## Reporting vulnerabilities

Если вы нашли уязвимость, **не открывайте публичный issue**.
Напишите на: security@<your-domain> (заменить на реальный).
