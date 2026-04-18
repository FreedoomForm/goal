import 'package:flutter/material.dart';
import '../services/api_client.dart';

class ScenariosScreen extends StatefulWidget {
  const ScenariosScreen({super.key});
  @override
  State<ScenariosScreen> createState() => _ScenariosScreenState();
}

class _ScenariosScreenState extends State<ScenariosScreen> {
  List<dynamic> _scenarios = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try { _scenarios = await ApiClient.instance.getJson('/api/scenarios') as List; }
    catch (_) { _scenarios = []; }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _run(dynamic id, String name) async {
    showDialog(context: context, barrierDismissible: false, builder: (_) => const Center(child: CircularProgressIndicator()));
    try {
      final r = await ApiClient.instance.postJson('/api/scenarios/$id/run', {'send_to_telegram': false});
      if (!mounted) return;
      Navigator.of(context).pop();
      showDialog(context: context, builder: (_) => AlertDialog(
        title: Text('Отчёт готов: $name'),
        content: SingleChildScrollView(child: Text(r.toString())),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      ));
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Сценарии'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)]),
      body: _loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(
        onRefresh: _load,
        child: ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _scenarios.length,
          itemBuilder: (_, i) {
            final s = _scenarios[i] as Map;
            return Card(child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(s['name']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                  if (s['cron_expr']?.toString().isNotEmpty == true)
                    Chip(label: Text(s['cron_expr'].toString(), style: const TextStyle(fontSize: 10, fontFamily: 'monospace'))),
                ]),
                const SizedBox(height: 6),
                Text(s['objective']?.toString() ?? '', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                const SizedBox(height: 10),
                Row(children: [
                  Chip(label: Text(s['category']?.toString() ?? '', style: const TextStyle(fontSize: 10))),
                  const Spacer(),
                  FilledButton.icon(onPressed: () => _run(s['id'], s['name']?.toString() ?? ''),
                      icon: const Icon(Icons.play_arrow, size: 16), label: const Text('Запустить')),
                ]),
              ]),
            ));
          },
        ),
      ),
    );
  }
}
