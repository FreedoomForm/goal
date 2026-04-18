import 'package:flutter/material.dart';
import '../services/api_client.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final d = await ApiClient.instance.getJson('/api/dashboard');
      setState(() { _data = d as Map<String, dynamic>; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Панель управления'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))))
              : RefreshIndicator(onRefresh: _load, child: _buildContent()),
    );
  }

  Widget _buildContent() {
    final d = _data ?? {};
    final hero = d['hero'] as Map? ?? {};
    final connectors = (d['connectors'] as List?) ?? [];
    final scenarios = (d['scenarios'] as List?) ?? [];
    final modules = (d['modules'] as List?) ?? [];
    final docs = (d['documents'] as List?) ?? [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(hero['title']?.toString() ?? 'AegisOps', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(hero['subtitle']?.toString() ?? '', style: const TextStyle(color: Colors.white70)),
          ],
        ))),
        const SizedBox(height: 8),
        _statsRow([
          ('Коннекторы', connectors.length, Icons.cable, const Color(0xFF59A8FF)),
          ('Сценарии', scenarios.length, Icons.play_circle, const Color(0xFF7C5CFF)),
          ('Модули', modules.length, Icons.extension, const Color(0xFF23C483)),
          ('Документы', docs.length, Icons.description, const Color(0xFFFFB347)),
        ]),
        const SizedBox(height: 16),
        _sectionTitle('Активные сценарии'),
        ...scenarios.take(5).map((s) => Card(child: ListTile(
          leading: const Icon(Icons.play_circle_outline, color: Color(0xFF59A8FF)),
          title: Text(s['name']?.toString() ?? ''),
          subtitle: Text(s['objective']?.toString() ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
          trailing: (s['enabled'] == 1 || s['enabled'] == true)
              ? const Icon(Icons.check_circle, color: Color(0xFF23C483))
              : const Icon(Icons.pause_circle, color: Colors.white38),
          onTap: () => _runScenario(s['id']),
        ))),
        const SizedBox(height: 16),
        _sectionTitle('Модули'),
        ...modules.map((m) => Card(child: ListTile(
          leading: Text(m['icon']?.toString() ?? '📊', style: const TextStyle(fontSize: 24)),
          title: Text(m['name']?.toString() ?? ''),
          subtitle: Text(m['description']?.toString() ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
        ))),
      ],
    );
  }

  Future<void> _runScenario(dynamic id) async {
    if (id == null) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Запускаем сценарий...')));
    try {
      await ApiClient.instance.postJson('/api/scenarios/$id/run', {});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Готово')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  Widget _statsRow(List<(String, int, IconData, Color)> items) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 2.4,
      children: items.map((item) => Card(child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Icon(item.$3, color: item.$4, size: 28),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.$1, style: const TextStyle(color: Colors.white54, fontSize: 11)),
            Text(item.$2.toString(), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          ])),
        ]),
      ))).toList(),
    );
  }

  Widget _sectionTitle(String t) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
    child: Text(t, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFFB2D6FF), letterSpacing: 1)),
  );
}
