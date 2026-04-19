import 'dart:convert';
import 'package:flutter/material.dart';
import '../services/api_client.dart';

class McpScreen extends StatefulWidget {
  const McpScreen({super.key});
  @override
  State<McpScreen> createState() => _McpScreenState();
}

class _McpScreenState extends State<McpScreen> {
  Map<String, dynamic>? _data;
  List<dynamic> _presets = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.getJson('/api/mcp/servers').catchError((_) => {'persisted': [], 'running': []}),
        ApiClient.instance.getJson('/api/mcp/presets').catchError((_) => []),
      ]);
      _data = results[0] as Map<String, dynamic>;
      _presets = results[1] as List? ?? [];
    } catch (_) {
      _data = {'persisted': [], 'running': []};
      _presets = [];
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _action(String name, String action) async {
    try {
      if (action == 'start') await ApiClient.instance.postJson('/api/mcp/servers/$name/start', {});
      if (action == 'stop') await ApiClient.instance.postJson('/api/mcp/servers/$name/stop', {});
      if (action == 'delete') await ApiClient.instance.deleteJson('/api/mcp/servers/$name');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(action == 'delete' ? '$name: удалён' : '$name: $action'),
        backgroundColor: action == 'delete' ? const Color(0xFFFF6A6A) : const Color(0xFF23C483),
      ));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e'), backgroundColor: const Color(0xFFFF6A6A)));
    }
  }

  void _showAddDialog() {
    String name = '';
    String selectedPreset = _presets.isNotEmpty ? (_presets[0] as Map)['preset']?.toString() ?? 'filesystem' : 'filesystem';
    String configJson = '{}';
    bool autoStart = false;

    showDialog(context: context, builder: (ctx) => StatefulBuilder(builder: (ctx, setDialogState) => AlertDialog(
      title: const Text('Новый MCP-сервер'),
      content: SingleChildScrollView(child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            decoration: const InputDecoration(labelText: 'Имя сервера', hintText: 'my-server'),
            onChanged: (v) => name = v,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: selectedPreset,
            decoration: const InputDecoration(labelText: 'Preset'),
            items: _presets.map<DropdownMenuItem<String>>((p) => DropdownMenuItem(
              value: (p as Map)['preset']?.toString() ?? '',
              child: Text('${p['preset']} — ${p['description']}', style: const TextStyle(fontSize: 13)),
            )).toList(),
            onChanged: (v) { if (v != null) setDialogState(() => selectedPreset = v); },
          ),
          const SizedBox(height: 12),
          TextField(
            decoration: const InputDecoration(labelText: 'Конфиг (JSON)', hintText: '{}'),
            maxLines: 3,
            controller: TextEditingController(text: configJson),
            onChanged: (v) => configJson = v,
            style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
          ),
          const SizedBox(height: 8),
          Row(children: [
            Checkbox(value: autoStart, onChanged: (v) => setDialogState(() => autoStart = v ?? false)),
            const Text('Автостарт'),
          ]),
        ],
      )),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
        FilledButton(onPressed: () async {
          if (name.trim().isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Введите имя сервера')));
            return;
          }
          Map<String, dynamic> config = {};
          try { config = jsonDecode(configJson) as Map<String, dynamic>; } catch (_) {}
          Navigator.pop(ctx);
          try {
            await ApiClient.instance.postJson('/api/mcp/servers', {
              'name': name.trim(), 'preset': selectedPreset, 'config': config, 'auto_start': autoStart,
            });
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Сервер зарегистрирован'), backgroundColor: Color(0xFF23C483)));
            _load();
          } catch (e) {
            if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e'), backgroundColor: const Color(0xFFFF6A6A)));
          }
        }, child: const Text('Сохранить')),
      ],
    )));
  }

  void _confirmDelete(String name) {
    showDialog(context: context, builder: (ctx) => AlertDialog(
      title: const Text('Удалить MCP сервер?'),
      content: Text('Удалить "$name"? Это действие нельзя отменить.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Отмена')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF6A6A)),
          onPressed: () { Navigator.pop(ctx); _action(name, 'delete'); },
          child: const Text('Удалить'),
        ),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) {
    final persisted = (_data?['persisted'] as List? ?? []);
    final running = Map.fromEntries((_data?['running'] as List? ?? []).map((r) => MapEntry(r['name']?.toString() ?? '', r as Map)));

    return Scaffold(
      appBar: AppBar(title: const Text('MCP серверы'), actions: [
        IconButton(icon: const Icon(Icons.add), onPressed: _showAddDialog, tooltip: 'Добавить сервер'),
        IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ]),
      body: _loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Padding(
              padding: EdgeInsets.all(8),
              child: Text('Model Context Protocol — стандарт интеграции AI с инструментами. Серверы запускаются на ПК.',
                  style: TextStyle(color: Colors.white54, fontSize: 12)),
            ),
            if (persisted.isEmpty) const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Text('Нет зарегистрированных MCP серверов.\nДобавьте их в desktop-приложении.',
                  textAlign: TextAlign.center, style: TextStyle(color: Colors.white38))),
            ),
            ...persisted.map((s) {
              final r = running[s['name']?.toString() ?? ''];
              final isRunning = r != null && (r['running'] == true) && (r['initialized'] == true);
              final tools = (r?['tools'] as List?) ?? [];
              return Card(child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(s['name']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700))),
                    Chip(
                      label: Text(isRunning ? 'running' : 'stopped', style: const TextStyle(fontSize: 10)),
                      backgroundColor: isRunning ? const Color(0xFF23C483).withOpacity(0.2) : Colors.white10,
                    ),
                  ]),
                  const SizedBox(height: 4),
                  Text('preset: ${s['preset']}', style: const TextStyle(color: Colors.white54, fontSize: 11, fontFamily: 'monospace')),
                  if (tools.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text('Инструменты (${tools.length}):', style: const TextStyle(fontSize: 11, color: Color(0xFFB2D6FF))),
                    ...tools.take(4).map((t) => Padding(
                      padding: const EdgeInsets.only(left: 8, top: 2),
                      child: Text('• ${t['name']}', style: const TextStyle(fontSize: 11, fontFamily: 'monospace')),
                    )),
                  ],
                  const SizedBox(height: 8),
                  Row(children: [
                    if (!isRunning) FilledButton.icon(onPressed: () => _action(s['name'].toString(), 'start'),
                        icon: const Icon(Icons.play_arrow, size: 16), label: const Text('Start')),
                    if (isRunning) OutlinedButton.icon(onPressed: () => _action(s['name'].toString(), 'stop'),
                        icon: const Icon(Icons.stop, size: 16), label: const Text('Stop')),
                    const Spacer(),
                    IconButton(icon: const Icon(Icons.delete_outline, size: 18, color: Color(0xFFFF6A6A)),
                        onPressed: () => _confirmDelete(s['name'].toString()), tooltip: 'Удалить'),
                  ]),
                ]),
              ));
            }),
          ],
        ),
      ),
    );
  }
}
