import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../services/api_client.dart';
import '../services/settings_service.dart';

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

  Future<void> _consume(String baseUrl, String code) async {
    setState(() { _busy = true; _error = null; });
    try {
      final r = await ApiClient.consumePairingCode(baseUrl: baseUrl, code: code);
      final apiKey = r['api_key'] as String?;
      final base = (r['base_url'] as String?)?.isNotEmpty == true ? r['base_url'] as String : baseUrl;
      if (apiKey == null || apiKey.isEmpty) throw Exception('Сервер не вернул API key');
      await SettingsService.instance.save(baseUrl: base, apiKey: apiKey);
      if (mounted) context.go('/dashboard');
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      if (mounted) setState(() { _busy = false; });
    }
  }

  Future<void> _scan() async {
    final result = await Navigator.of(context).push<String>(MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: const Text('Сканируйте QR')),
        body: MobileScanner(onDetect: (capture) {
          final raw = capture.barcodes.firstOrNull?.rawValue;
          if (raw != null) Navigator.of(context).pop(raw);
        }),
      ),
    ));
    if (result == null) return;
    try {
      final data = jsonDecode(result) as Map<String, dynamic>;
      final base = data['base']?.toString() ?? '';
      final code = data['code']?.toString() ?? '';
      if (base.isEmpty || code.isEmpty) throw Exception('QR без base/code');
      await _consume(base, code);
    } catch (e) {
      setState(() { _error = 'Неверный QR: $e'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AegisOps Mobile — подключение')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 20),
              const Icon(Icons.shield_outlined, size: 64, color: Color(0xFF59A8FF)),
              const SizedBox(height: 20),
              const Text('Подключитесь к вашему ПК-серверу AegisOps',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              const Text('На ПК: вкладка «Мобильный доступ» → «Создать код сопряжения»',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: Colors.white54)),
              const SizedBox(height: 30),
              FilledButton.icon(
                onPressed: _busy ? null : _scan,
                icon: const Icon(Icons.qr_code_scanner),
                label: const Padding(padding: EdgeInsets.all(12), child: Text('Сканировать QR')),
              ),
              const SizedBox(height: 30),
              const Divider(),
              const SizedBox(height: 10),
              const Text('...или введите вручную:', style: TextStyle(color: Colors.white54)),
              const SizedBox(height: 12),
              TextField(controller: _baseCtl, decoration: const InputDecoration(labelText: 'URL сервера (https://...)', prefixIcon: Icon(Icons.link))),
              const SizedBox(height: 10),
              TextField(controller: _codeCtl, decoration: const InputDecoration(labelText: 'Код сопряжения (6 цифр)', prefixIcon: Icon(Icons.password))),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : () => _consume(_baseCtl.text.trim(), _codeCtl.text.trim()),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: _busy ? const CircularProgressIndicator(strokeWidth: 2) : const Text('Подключиться'),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0xFFFF6A6A).withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                  child: Text(_error!, style: const TextStyle(color: Color(0xFFFF6A6A))),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
