# Security Guide

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

### Transport
- **HTTPS (mobile)**: `network_security_config.xml` → cleartextTrafficPermitted="false" по умолчанию. Исключения для LAN-диапазонов (192.168/16, 10/8, 172.16/12).
- **Tunnel**: Cloudflare → автоматический TLS (wildcard certs). ngrok → тоже TLS.
- **CSP**: жёсткий, `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (unsafe-inline — только для inline SVG и Electron bridge; можно ужесточить с nonce).

### Input validation
- `inputSanitizer` middleware применяется ко всем request body/query.
- Убирает управляющие байты (0x00-0x1F кроме \n\r\t).
- Блокирует ключи `__proto__`, `constructor`, `prototype` в body (prototype pollution).
- Payload-guard: 10 MB max.
- Все SQL-запросы — параметризованы (`sql.js` prepared statements).

### Rate limiting
- 300 req/мин на комбинацию IP + route-prefix (sliding window, in-memory).
- Response включает `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

### Logging
- JSON-line структурированный лог.
- **Secret redaction**: ключи `password`, `token`, `secret`, `api_key`, `authorization`, `private_key` автоматически маскируются (`***REDACTED***`) перед записью.
- Request ID (`X-Request-Id`) прокидывается во все логи для корреляции.

### Storage secrets
- **Server secret** (для HMAC подписи JWT): генерируется при первом запуске (48 байт `crypto.randomBytes`), хранится в `settings` таблице. Приоритет: env `AEGISOPS_SECRET` → БД.
- **Connector credentials** (1C passwords, SAP tokens, Telegram bot token): хранятся в `connectors.auth_payload` как JSON. **TODO**: добавить шифрование через serverSecret, сейчас — plaintext в БД.
- **Android**: API-key и base URL хранятся в `flutter_secure_storage` → шифрованный SharedPreferences (AES-256, ключ в Android KeyStore).

### Mobile-specific
- QR-код сопряжения содержит только `{ base, code }`. Код — 6 цифр, действует 5 минут, одноразовый.
- После consume → API-key выдаётся один раз и сохраняется в KeyStore. Не восстанавливается.
- APK не имеет жёстко прошитых адресов/ключей.

## Рекомендации для production deployment

### Обязательно
- [ ] Установите собственный `AEGISOPS_SECRET` (env) вместо автогенерированного.
- [ ] Установите admin password (`POST /api/auth/bootstrap`).
- [ ] Переключитесь на `AEGISOPS_ENFORCE_LOCAL_AUTH=1` для защищённых сред.
- [ ] Используйте custom Cloudflare Tunnel с именованным именем (а не `trycloudflare.com` — он публично-доступный и легко сканируется).
- [ ] Шифруйте `connectors.auth_payload` — текущая версия хранит в plaintext.
- [ ] Настройте signing для Android release (`android/app/build.gradle` → `signingConfigs.release`).
- [ ] Отзывайте неиспользуемые API-keys в `Settings → API keys`.

### Желательно
- [ ] Переход на HTTPS для localhost через self-signed сертификат (для тех, кто держит AegisOps на отдельной машине в LAN).
- [ ] Интеграция с корпоративным SSO (Azure AD, Keycloak) — добавить OIDC middleware.
- [ ] Аудит-логи отправлять в SIEM (Splunk, Elastic). Все события уже пишутся в `audit_log` таблицу.
- [ ] Регулярная ротация `server_secret` с переиздачей JWT.

## Reporting vulnerabilities

Если вы нашли уязвимость, **не открывайте публичный issue**.  
Напишите на: security@<your-domain> (заменить на реальный).
