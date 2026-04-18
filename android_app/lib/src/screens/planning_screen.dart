import 'package:flutter/material.dart';
import '../services/api_client.dart';

/// Mobile-friendly list view of workflows with quick "run" buttons.
/// Full visual editor stays on the PC (see Planning page in Electron UI),
/// but mobile can save/load/run graphs.
class PlanningScreen extends StatefulWidget {
  const PlanningScreen({super.key});
  @override
  State<PlanningScreen> createState() => _PlanningScreenState();
}

class _PlanningScreenState extends State<PlanningScreen> {
  List<dynamic> _wfs = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try { _wfs = await ApiClient.instance.getJson('/api/workflows') as List; }
    catch (_) { _wfs = []; }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _run(dynamic id) async {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Запускаем workflow...')));
    try {
      final r = await ApiClient.instance.postJson('/api/workflows/$id/run', {});
      if (!mounted) return;
      showDialog(context: context, builder: (_) => AlertDialog(
        title: const Text('Трассировка'),
        content: SingleChildScrollView(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: (r['trace'] as List? ?? []).map((t) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(children: [
              Icon(
                t['status'] == 'ok' ? Icons.check_circle : t['status'] == 'error' ? Icons.error : Icons.skip_next,
                color: t['status'] == 'ok' ? Colors.green : t['status'] == 'error' ? Colors.red : Colors.amber, size: 16,
              ),
              const SizedBox(width: 6),
              Expanded(child: Text('${t['id']} (${t['type']}) — ${t['status']} ${t['ms']}мс',
                  style: const TextStyle(fontSize: 12, fontFamily: 'monospace'))),
            ]),
          )).toList(),
        )),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Workflow (Планирование)'), actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)]),
      body: _loading ? const Center(child: CircularProgressIndicator()) : RefreshIndicator(
        onRefresh: _load,
        child: _wfs.isEmpty ? ListView(children: const [
          SizedBox(height: 120),
          Icon(Icons.account_tree_outlined, size: 64, color: Color(0xFF59A8FF)),
          SizedBox(height: 16),
          Center(child: Text('Нет сохранённых workflow', style: TextStyle(color: Colors.white54))),
          SizedBox(height: 8),
          Center(child: Padding(padding: EdgeInsets.symmetric(horizontal: 40), child: Text(
            'Создайте их в desktop-приложении AegisOps: вкладка «Планирование» → визуальный конструктор n8n-style',
            textAlign: TextAlign.center, style: TextStyle(color: Colors.white38, fontSize: 12),
          ))),
        ]) : ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: _wfs.length,
          itemBuilder: (_, i) {
            final w = _wfs[i] as Map;
            final graph = w['graph'] as Map? ?? {};
            final nodeCount = (graph['nodes'] as List? ?? []).length;
            final edgeCount = (graph['edges'] as List? ?? []).length;
            return Card(child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(w['name']?.toString() ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                if (w['description']?.toString().isNotEmpty == true)
                  Text(w['description'].toString(), style: const TextStyle(color: Colors.white70, fontSize: 12)),
                const SizedBox(height: 8),
                Row(children: [
                  Chip(label: Text('$nodeCount нод', style: const TextStyle(fontSize: 10))),
                  const SizedBox(width: 6),
                  Chip(label: Text('$edgeCount связей', style: const TextStyle(fontSize: 10))),
                  const Spacer(),
                  FilledButton.icon(onPressed: () => _run(w['id']), icon: const Icon(Icons.play_arrow, size: 16), label: const Text('Запустить')),
                ]),
              ]),
            ));
          },
        ),
      ),
    );
  }
}
