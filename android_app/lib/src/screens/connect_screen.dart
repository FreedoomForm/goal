import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../services/api_client.dart';
import '../services/settings_service.dart';
import '../theme.dart';

class ConnectScreen extends StatefulWidget {
  const ConnectScreen({super.key});
  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final _baseCtl = TextEditingController();
  final _codeCtl = TextEditingController();
  bool _busy = false;
  String? _error;
  String _connectionMode = 'auto'; // 'auto', 'ws', 'http'

  @override
  void dispose() {
    _baseCtl.dispose();
    _codeCtl.dispose();
    super.dispose();
  }

  /// Connect via WebSocket pairing code flow
  Future<void> _consumeViaWebSocket(String wsUrl, String code) async {
    setState(() { _busy = true; _error = null; });

    String normalizedUrl = wsUrl;
    if (!normalizedUrl.startsWith('ws://') && !normalizedUrl.startsWith('wss://')) {
      normalizedUrl = 'ws://$normalizedUrl';
    }

    try {
      if (code.isEmpty) throw Exception('Введите код сопряжения');

      final channel = WebSocketChannel.connect(Uri.parse(normalizedUrl));
      final completer = Completer<Map<String, dynamic>>();

      // Set a timeout
      final timeout = Timer(const Duration(seconds: 15), () {
        if (!completer.isCompleted) {
          completer.completeError(Exception('Таймаут подключения'));
        }
      });

      // Listen for auth_result
      channel.stream.listen(
        (message) {
          try {
            final data = jsonDecode(message) as Map<String, dynamic>;
            if (data['type'] == 'welcome') {
              // Send auth message after welcome
              channel.sink.add(jsonEncode({
                'type': 'auth',
                'code': code,
              }));
              return;
            }
            if (data['type'] == 'auth_result' && !completer.isCompleted) {
              if (data['success'] == true) {
                completer.complete(data);
              } else {
                completer.completeError(Exception(data['error'] ?? 'Ошибка аутентификации'));
              }
            }
          } catch (e) {
            if (!completer.isCompleted) {
              completer.completeError(Exception('Неверный ответ сервера'));
            }
          }
        },
        onError: (error) {
          if (!completer.isCompleted) {
            completer.completeError(Exception('Ошибка WebSocket: $error'));
          }
        },
        onDone: () {
          if (!completer.isCompleted) {
            completer.completeError(Exception('Соединение закрыто'));
          }
        },
      );

      final result = await completer.future;
      timeout.cancel();

      final apiKey = result['api_key']?.toString();
      if (apiKey == null || apiKey.isEmpty) {
        throw Exception('Сервер не вернул API key');
      }

      // Derive HTTP base URL from WS URL
      final httpBase = normalizedUrl
          .replaceFirst('wss://', 'https://')
          .replaceFirst('ws://', 'http://')
          .replaceFirst(RegExp(r':\d+(/.*)?$'), ''); // Remove port for HTTP

      // Save credentials — store WS URL for future use
      await SettingsService.instance.save(
        baseUrl: httpBase.isNotEmpty ? httpBase : normalizedUrl,
        apiKey: apiKey,
      );
      await SettingsService.instance.saveWsUrl(normalizedUrl);

      // Close WS (we'll reconnect later for real-time events)
      await channel.sink.close();

      if (mounted) context.go('/dashboard');
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _busy = false; });
    }
  }

  /// Connect via HTTP pairing code flow (original)
  Future<void> _consumeViaHttp(String baseUrl, String code) async {
    setState(() { _busy = true; _error = null; });
    try {
      if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        throw Exception('URL должен начинаться с http:// или https://');
      }
      if (code.isEmpty) throw Exception('Введите код сопряжения');
      final r = await ApiClient.consumePairingCode(baseUrl: baseUrl, code: code);
      final apiKey = r['api_key']?.toString();
      final base = (r['base_url']?.toString()?.isNotEmpty == true) ? r['base_url']!.toString() : baseUrl;
      if (apiKey == null || apiKey.isEmpty) throw Exception('Сервер не вернул API key');
      await SettingsService.instance.save(baseUrl: base, apiKey: apiKey);
      if (mounted) context.go('/dashboard');
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); });
    } finally {
      if (mounted) setState(() { _busy = false; });
    }
  }

  /// Auto-detect connection type and connect
  Future<void> _connect(String input, String code) async {
    if (input.startsWith('ws://') || input.startsWith('wss://')) {
      await _consumeViaWebSocket(input, code);
    } else if (input.startsWith('http://') || input.startsWith('https://')) {
      await _consumeViaHttp(input, code);
    } else {
      // Try as LAN IP — default to WebSocket
      if (_connectionMode == 'http') {
        await _consumeViaHttp('http://$input', code);
      } else {
        await _consumeViaWebSocket('ws://$input', code);
      }
    }
  }

  Future<void> _scan() async {
    final result = await Navigator.of(context).push<String>(MaterialPageRoute(
      builder: (_) => _QrScannerScreen(),
    ));
    if (result == null) return;
    try {
      final data = jsonDecode(result) as Map<String, dynamic>;
      final base = data['base']?.toString() ?? '';
      final wsUrl = data['ws']?.toString() ?? '';
      final code = data['code']?.toString() ?? '';

      if (code.isEmpty) throw Exception('QR без кода сопряжения');

      // Prefer WebSocket URL if available
      if (wsUrl.isNotEmpty) {
        await _consumeViaWebSocket(wsUrl, code);
      } else if (base.isNotEmpty) {
        await _consumeViaHttp(base, code);
      } else {
        throw Exception('QR без адреса сервера');
      }
    } catch (e) {
      setState(() { _error = 'Неверный QR: ${e.toString().replaceFirst('Exception: ', '')}'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AnimatedAppBackground(
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 24, 22, 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 20),
                // Hero logo with glow
                Center(
                  child: Container(
                    width: 96, height: 96,
                    decoration: BoxDecoration(
                      gradient: AegisColors.accentGradient,
                      borderRadius: BorderRadius.circular(26),
                      boxShadow: [
                        BoxShadow(color: AegisColors.accentBlue.withOpacity(0.35), blurRadius: 30, offset: const Offset(0, 10)),
                        BoxShadow(color: AegisColors.accentPurple.withOpacity(0.25), blurRadius: 60, offset: const Offset(0, 16)),
                      ],
                    ),
                    child: const Icon(Icons.shield_outlined, size: 52, color: Colors.white),
                  ),
                ),
                const SizedBox(height: 22),
                Center(
                  child: ShaderMask(
                    shaderCallback: (bounds) => AegisColors.accentGradient.createShader(bounds),
                    child: const Text(
                      'AegisOps',
                      style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Colors.white, fontFamily: 'Inter', letterSpacing: -0.8),
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                const Center(
                  child: Text('Local AI Platform',
                    style: TextStyle(fontSize: 13, color: AegisColors.textSecondary, fontFamily: 'Inter', letterSpacing: 2, fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(height: 28),
                const Text('Подключитесь к вашему ПК-серверу',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AegisColors.textPrimary, fontFamily: 'Inter')),
                const SizedBox(height: 8),
                const Text('На ПК откройте вкладку «Мобильный доступ» и запустите локальный шлюз',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: AegisColors.textTertiary, fontFamily: 'Inter', height: 1.5)),
                const SizedBox(height: 28),

                // Primary action: Scan QR (gradient button)
                _GradientButton(
                  icon: Icons.qr_code_scanner_rounded,
                  label: 'Сканировать QR-код',
                  onPressed: _busy ? null : _scan,
                ),

                const SizedBox(height: 24),
                // Divider with "or"
                Row(children: [
                  Expanded(child: Container(height: 1, color: AegisColors.borderSoft)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text('ИЛИ ВРУЧНУЮ',
                        style: TextStyle(fontSize: 10.5, letterSpacing: 2, color: AegisColors.textTertiary.withOpacity(0.8), fontWeight: FontWeight.w700, fontFamily: 'Inter')),
                  ),
                  Expanded(child: Container(height: 1, color: AegisColors.borderSoft)),
                ]),
                const SizedBox(height: 20),

                // Connection mode selector
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                  decoration: BoxDecoration(
                    color: AegisColors.bgCard.withOpacity(0.5),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AegisColors.border),
                  ),
                  child: Row(
                    children: [
                      _ModeChip(
                        label: 'Авто',
                        selected: _connectionMode == 'auto',
                        onTap: () => setState(() { _connectionMode = 'auto'; }),
                      ),
                      _ModeChip(
                        label: 'WebSocket',
                        selected: _connectionMode == 'ws',
                        onTap: () => setState(() { _connectionMode = 'ws'; }),
                      ),
                      _ModeChip(
                        label: 'HTTP',
                        selected: _connectionMode == 'http',
                        onTap: () => setState(() { _connectionMode = 'http'; }),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Form card
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AegisColors.bgCard.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AegisColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextField(
                        controller: _baseCtl,
                        keyboardType: TextInputType.url,
                        autocorrect: false,
                        decoration: InputDecoration(
                          labelText: _connectionMode == 'http' ? 'URL сервера' : 'Адрес сервера',
                          hintText: _connectionMode == 'http'
                              ? 'https://example.com'
                              : _connectionMode == 'ws'
                                  ? 'ws://192.168.1.100:18091'
                                  : '192.168.1.100:18091',
                          prefixIcon: Icon(
                            _connectionMode == 'http' ? Icons.link_rounded : Icons.wifi_rounded,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _codeCtl,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        decoration: const InputDecoration(
                          labelText: 'Код сопряжения',
                          hintText: '6 цифр',
                          prefixIcon: Icon(Icons.password_rounded),
                          counterText: '',
                        ),
                      ),
                      const SizedBox(height: 14),
                      SizedBox(
                        height: 48,
                        child: FilledButton.icon(
                          onPressed: _busy ? null : () => _connect(_baseCtl.text.trim(), _codeCtl.text.trim()),
                          icon: _busy
                              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : Icon(
                                  _connectionMode == 'http' ? Icons.login_rounded : Icons.cable_rounded,
                                  size: 18,
                                ),
                          label: Text(_busy ? 'Подключение...' : 'Подключиться'),
                        ),
                      ),
                    ],
                  ),
                ),

                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AegisColors.danger.withOpacity(0.10),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AegisColors.danger.withOpacity(0.30)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.error_outline_rounded, color: AegisColors.danger, size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(_error!, style: const TextStyle(color: AegisColors.danger, fontFamily: 'Inter', fontSize: 13, height: 1.4)),
                        ),
                      ],
                    ),
                  ),
                ],

                const SizedBox(height: 28),
                // Feature pills
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 8, runSpacing: 8,
                  children: const [
                    _FeaturePill(icon: Icons.lock_outline_rounded, text: 'Безопасный канал'),
                    _FeaturePill(icon: Icons.flash_on_rounded, text: '100% On-Prem'),
                    _FeaturePill(icon: Icons.memory_rounded, text: 'Local AI'),
                  ],
                ),

                const SizedBox(height: 24),
                const Center(
                  child: Text('v1.2.0 • AegisOps Mobile',
                    style: TextStyle(fontSize: 11, color: AegisColors.textTertiary, fontFamily: 'Inter')),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ModeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _ModeChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: selected ? AegisColors.accentBlue.withOpacity(0.2) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected ? AegisColors.accentBlue : AegisColors.textTertiary,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              fontSize: 12,
              fontFamily: 'Inter',
            ),
          ),
        ),
      ),
    );
  }
}

class _GradientButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  const _GradientButton({required this.icon, required this.label, this.onPressed});

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Opacity(
      opacity: enabled ? 1.0 : 0.5,
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onPressed,
          child: Ink(
            decoration: BoxDecoration(
              gradient: AegisColors.accentGradient,
              borderRadius: BorderRadius.circular(14),
              boxShadow: enabled ? [
                BoxShadow(color: AegisColors.accentBlue.withOpacity(0.35), blurRadius: 16, offset: const Offset(0, 6)),
              ] : null,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, color: Colors.white, size: 20),
                  const SizedBox(width: 10),
                  Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15, fontFamily: 'Inter')),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _FeaturePill extends StatelessWidget {
  final IconData icon;
  final String text;
  const _FeaturePill({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AegisColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AegisColors.accentBlue),
          const SizedBox(width: 6),
          Text(text, style: const TextStyle(fontSize: 11.5, color: AegisColors.textSecondary, fontFamily: 'Inter', fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// Separate QR scanner screen with double-pop protection
class _QrScannerScreen extends StatefulWidget {
  @override
  State<_QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<_QrScannerScreen> {
  bool _popped = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('Сканируйте QR'),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        children: [
          MobileScanner(onDetect: (capture) {
            final raw = capture.barcodes.firstOrNull?.rawValue;
            if (raw != null && !_popped) {
              _popped = true;
              Navigator.of(context).pop(raw);
            }
          }),
          // Scan overlay — corner brackets
          Center(
            child: Container(
              width: 240, height: 240,
              decoration: BoxDecoration(
                border: Border.all(color: AegisColors.accentBlue.withOpacity(0.8), width: 2),
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
          const Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text('Наведите камеру на QR-код сопряжения',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white, fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}
