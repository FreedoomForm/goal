import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../services/settings_service.dart';
import '../theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _showKey = false;

  @override
  Widget build(BuildContext context) {
    final s = SettingsService.instance;
    final apiKey = s.apiKey ?? '';
    final maskedKey = apiKey.isEmpty
        ? '—'
        : (_showKey
            ? apiKey
            : (apiKey.length > 12
                ? '${apiKey.substring(0, 4)}••••••••${apiKey.substring(apiKey.length - 4)}'
                : '••••••••'));

    return Scaffold(
      appBar: AppBar(
        title: const BrandedTitle('Настройки', icon: Icons.settings_rounded),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
        children: [
          _sectionTitle('СОЕДИНЕНИЕ С СЕРВЕРОМ'),
          _infoCard(
            icon: Icons.link_rounded,
            iconColor: AegisColors.accentBlue,
            title: 'URL сервера',
            value: s.baseUrl ?? '—',
            valueMono: true,
            onCopy: s.baseUrl == null ? null : () => _copy(s.baseUrl!, 'URL скопирован'),
          ),
          const SizedBox(height: 10),
          _infoCard(
            icon: Icons.vpn_key_rounded,
            iconColor: AegisColors.accentPurple,
            title: 'API-ключ',
            value: maskedKey,
            valueMono: true,
            trailingButton: apiKey.isEmpty ? null : IconButton(
              icon: Icon(_showKey ? Icons.visibility_off_rounded : Icons.visibility_rounded, size: 20),
              onPressed: () => setState(() => _showKey = !_showKey),
              tooltip: _showKey ? 'Скрыть' : 'Показать',
            ),
            onCopy: apiKey.isEmpty ? null : () => _copy(apiKey, 'API-ключ скопирован'),
          ),
          const SizedBox(height: 22),
          _sectionTitle('СТАТУС'),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AegisColors.success.withOpacity(0.08),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AegisColors.success.withOpacity(0.25)),
            ),
            child: Row(children: [
              const PulseDot(color: AegisColors.success, size: 10),
              const SizedBox(width: 12),
              const Expanded(child: Text('Подключено к серверу',
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: AegisColors.success, fontFamily: 'Inter'))),
              const Icon(Icons.check_circle_rounded, color: AegisColors.success, size: 18),
            ]),
          ),
          const SizedBox(height: 22),
          _sectionTitle('ДЕЙСТВИЯ'),
          Container(
            decoration: BoxDecoration(
              color: AegisColors.bgCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AegisColors.border),
            ),
            child: Column(children: [
              _actionTile(
                icon: Icons.logout_rounded,
                iconColor: AegisColors.danger,
                title: 'Отключиться от сервера',
                subtitle: 'Удалить URL сервера и API-ключ',
                onTap: _disconnect,
              ),
            ]),
          ),
          const SizedBox(height: 22),
          _sectionTitle('О ПРИЛОЖЕНИИ'),
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AegisColors.bgCard,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AegisColors.border),
            ),
            child: Row(children: [
              const BrandLogoMark(size: 44),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('AegisOps Mobile',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AegisColors.textPrimary, fontFamily: 'Inter')),
                    const SizedBox(height: 2),
                    Text('Enterprise AI Platform',
                        style: const TextStyle(fontSize: 11, color: AegisColors.textSecondary, letterSpacing: 1.5, fontFamily: 'Inter', fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  gradient: AegisColors.accentGradient,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: const Text('v1.1.0',
                    style: TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w700, fontFamily: 'Inter')),
              ),
            ]),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String t) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
    child: Text(t, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AegisColors.accentBlue, letterSpacing: 1.5, fontFamily: 'Inter')),
  );

  Widget _infoCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String value,
    bool valueMono = false,
    Widget? trailingButton,
    VoidCallback? onCopy,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AegisColors.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AegisColors.border),
      ),
      child: Row(children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.14),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: iconColor.withOpacity(0.25)),
          ),
          child: Icon(icon, color: iconColor, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontSize: 11.5, color: AegisColors.textSecondary, fontWeight: FontWeight.w600, fontFamily: 'Inter')),
            const SizedBox(height: 3),
            Text(value,
                maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  color: AegisColors.textPrimary,
                  fontFamily: valueMono ? 'monospace' : 'Inter',
                  fontWeight: FontWeight.w600,
                )),
          ],
        )),
        if (trailingButton != null) trailingButton,
        if (onCopy != null)
          IconButton(
            icon: const Icon(Icons.copy_rounded, size: 18),
            onPressed: onCopy,
            tooltip: 'Копировать',
          ),
      ]),
    );
  }

  Widget _actionTile({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: iconColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: iconColor.withOpacity(0.2)),
              ),
              child: Icon(icon, color: iconColor, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: iconColor, fontFamily: 'Inter')),
                const SizedBox(height: 2),
                Text(subtitle, style: const TextStyle(fontSize: 11.5, color: AegisColors.textTertiary, fontFamily: 'Inter')),
              ],
            )),
            const Icon(Icons.chevron_right_rounded, color: AegisColors.textTertiary),
          ]),
        ),
      ),
    );
  }

  void _copy(String text, String message) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).removeCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Row(children: [
        const Icon(Icons.check_circle_rounded, color: AegisColors.success, size: 18),
        const SizedBox(width: 8),
        Text(message),
      ]),
      duration: const Duration(seconds: 2),
    ));
  }

  Future<void> _disconnect() async {
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Отключиться?'),
      content: const Text('Будут удалены URL сервера и API-ключ. Вы потеряете доступ к данным ПК-сервера.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AegisColors.danger),
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Отключиться'),
        ),
      ],
    ));
    if (ok == true) {
      await SettingsService.instance.clear();
      if (mounted) context.go('/connect');
    }
  }
}
