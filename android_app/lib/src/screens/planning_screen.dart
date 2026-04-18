import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../theme.dart';

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
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      _wfs = await ApiClient.instance.getJson('/api/workflows') as List;
    } catch (e) {
      _wfs = [];
      _error = e.toString().replaceFirst('Exception: ', '');
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _run(dynamic id) async {
    ScaffoldMessenger.of(context).removeCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Row(children: [
        SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AegisColors.accentBlue)),
        SizedBox(width: 12),
        Text('Запускаем workflow...'),
      ]),
      duration: Duration(seconds: 2),
    ));
    try {
      final r = await ApiClient.instance.postJson('/api/workflows/$id/run', {});
      if (!mounted) return;
      final trace = (r['trace'] as List? ?? []);
      showDialog(context: context, builder: (_) => AlertDialog(
        title: Row(children: [
          const Icon(Icons.timeline_rounded, color: AegisColors.accentBlue, size: 20),
          const SizedBox(width: 8),
          const Text('Трассировка выполнения'),
        ]),
        content: SizedBox(
          width: double.maxFinite,
          child: trace.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Нет данных о выполнении',
                      style: TextStyle(color: AegisColors.textTertiary, fontFamily: 'Inter')),
                )
              : ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 400),
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: trace.map((t) {
                        final status = t['status']?.toString() ?? '';
                        final (color, icon) = switch (status) {
                          'ok' => (AegisColors.success, Icons.check_circle_rounded),
                          'error' => (AegisColors.danger, Icons.error_rounded),
                          _ => (AegisColors.warning, Icons.skip_next_rounded),
                        };
                        return Container(
                          margin: const EdgeInsets.only(bottom: 4),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: color.withOpacity(0.06),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: color.withOpacity(0.2)),
                          ),
                          child: Row(children: [
                            Icon(icon, color: color, size: 15),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text('${t['id']} · ${t['type']}',
                                  style: const TextStyle(fontSize: 11.5, fontFamily: 'monospace', color: AegisColors.textPrimary, fontWeight: FontWeight.w600)),
                            ),
                            Text('${t['ms']}мс',
                                style: TextStyle(fontSize: 10.5, color: color, fontWeight: FontWeight.w700, fontFamily: 'monospace')),
                          ]),
                        );
                      }).toList(),
                    ),
                  ),
                ),
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Закрыть'))],
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Ошибка: ${e.toString().replaceFirst('Exception: ', '')}'),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const BrandedTitle('Workflows', icon: Icons.account_tree_rounded),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _loading ? null : _load),
          const SizedBox(width: 4),
        ],
      ),
      body: _loading
          ? ListView(padding: const EdgeInsets.all(16), children: List.generate(4, (_) => const SkeletonCard(height: 100)))
          : _error != null && _wfs.isEmpty
              ? ErrorRetry(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  color: AegisColors.accentBlue,
                  backgroundColor: AegisColors.bgElevated,
                  child: _wfs.isEmpty
                      ? ListView(children: const [
                          SizedBox(height: 60),
                          EmptyState(
                            icon: Icons.account_tree_rounded,
                            title: 'Нет сохранённых workflow',
                            description: 'Создайте их в desktop-приложении AegisOps: вкладка «Планирование» → визуальный конструктор n8n-style',
                          ),
                        ])
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                          itemCount: _wfs.length,
                          itemBuilder: (_, i) => _workflowCard(_wfs[i] as Map),
                        ),
                ),
    );
  }

  Widget _workflowCard(Map w) {
    final graph = w['graph'] as Map? ?? {};
    final nodeCount = (graph['nodes'] as List? ?? []).length;
    final edgeCount = (graph['edges'] as List? ?? []).length;
    final desc = w['description']?.toString() ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AegisColors.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AegisColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  AegisColors.accentPurple.withOpacity(0.18),
                  AegisColors.accentBlue.withOpacity(0.14),
                ]),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AegisColors.accentPurple.withOpacity(0.2)),
              ),
              child: const Icon(Icons.account_tree_rounded, color: AegisColors.accentPurple, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(w['name']?.toString() ?? '',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, fontFamily: 'Inter', color: AegisColors.textPrimary)),
            ),
          ]),
          if (desc.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(desc,
                maxLines: 2, overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AegisColors.textSecondary, fontSize: 12.5, fontFamily: 'Inter', height: 1.45)),
          ],
          const SizedBox(height: 12),
          Row(children: [
            _metric(Icons.hub_rounded, '$nodeCount нод'),
            const SizedBox(width: 6),
            _metric(Icons.compare_arrows_rounded, '$edgeCount связей'),
            const Spacer(),
            FilledButton.icon(
              onPressed: () => _run(w['id']),
              icon: const Icon(Icons.play_arrow_rounded, size: 18),
              label: const Text('Запустить'),
              style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8)),
            ),
          ]),
        ]),
      ),
    );
  }

  Widget _metric(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AegisColors.bgDeep,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AegisColors.borderSoft),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 11, color: AegisColors.textSecondary),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 10.5, color: AegisColors.textSecondary, fontFamily: 'Inter', fontWeight: FontWeight.w600)),
      ]),
    );
  }
}
