import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/settings_service.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = SettingsService.instance;
    return Scaffold(
      appBar: AppBar(title: const Text('Настройки')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(child: ListTile(
            leading: const Icon(Icons.link, color: Color(0xFF59A8FF)),
            title: const Text('URL сервера'),
            subtitle: Text(s.baseUrl ?? '—'),
          )),
          Card(child: ListTile(
            leading: const Icon(Icons.key, color: Color(0xFF7C5CFF)),
            title: const Text('API-ключ'),
            subtitle: Text(() { final k = s.apiKey ?? ''; return k.isEmpty ? '—' : k.replaceRange(0, k.length > 8 ? 8 : k.length, '••••••'); }() ),
          )),
          const SizedBox(height: 16),
          FilledButton.tonalIcon(
            onPressed: () async {
              final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
                title: const Text('Отключиться?'),
                content: const Text('Будут удалены URL сервера и API-ключ.'),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
                  FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Отключиться')),
                ],
              ));
              if (ok == true) {
                await SettingsService.instance.clear();
                if (context.mounted) context.go('/connect');
              }
            },
            icon: const Icon(Icons.logout),
            label: const Padding(padding: EdgeInsets.all(8), child: Text('Отключиться от сервера')),
          ),
          const SizedBox(height: 30),
          const Center(child: Text('AegisOps Mobile v1.1.0', style: TextStyle(color: Colors.white38))),
        ],
      ),
    );
  }
}
