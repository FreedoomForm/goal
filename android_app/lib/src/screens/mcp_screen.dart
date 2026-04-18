import 'package:flutter/material.dart';
import '../services/api_client.dart';

class McpScreen extends StatefulWidget {
  const McpScreen({super.key});
  @override
  State<McpScreen> createState() => _McpScreenState();
}

class _McpScreenState extends State<McpScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try { _data = await ApiClient.instance.getJson('/api/mcp/servers') as Map<String, dynamic>; }
    catch (_) { _data = {'persisted': [], 'running': []}; }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _action(String name, String action) async {
    try {
      if (action == 'start') await ApiClient.instance.postJson('/api/mcp/servers/$name/start', {});
      if (action == 'stop') await ApiClient.instance.postJson('/api/mcp/servers/$name/stop', {});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$name: $action')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final persisted = (_data?['persisted'] as List? ?? []);
    final running = Map.fromEntries((_data?['running'] as List? ?? []).map((r) => MapEntry(r['name']?.toString() ?? '', r as Map)));

    return Scaffold(
      appBar: AppBar(title: const Text('MCP серверы'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)]),
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
