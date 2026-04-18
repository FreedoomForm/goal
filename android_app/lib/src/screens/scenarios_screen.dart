import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../theme.dart';

class ScenariosScreen extends StatefulWidget {
  const ScenariosScreen({super.key});
  @override
  State<ScenariosScreen> createState() => _ScenariosScreenState();
}

class _ScenariosScreenState extends State<ScenariosScreen> {
  List<dynamic> _scenarios = [];
  bool _loading = true;
  String? _error;
  String _filter = 'all';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final raw = await ApiClient.instance.getJson('/api/scenarios');
      _scenarios = raw is List ? raw : [];
    } catch (e) {
      _scenarios = [];
      _error = e.toString().replaceFirst('Exception: ', '');
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _run(dynamic id, String name) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Dialog(
        backgroundColor: AegisColors.bgSurface,
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5, color: AegisColors.accentBlue)),
            SizedBox(width: 16),
            Text('Выполнение...', style: TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600)),
          ]),
        ),
      ),
    );
    try {
      final r = await ApiClient.instance.postJson('/api/scenarios/$id/run', {'send_to_telegram': false});
      if (!mounted) return;
      Navigator.of(context).pop();
      showDialog(context: context, builder: (_) => AlertDialog(
        title: Row(children: [
          const Icon(Icons.check_circle_rounded, color: AegisColors.success, size: 22),
          const SizedBox(width: 8),
          Expanded(child: Text('Отчёт готов', style: const TextStyle(fontSize: 16))),
        ]),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 400),
          child: SingleChildScrollView(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AegisColors.bgDeep,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AegisColors.borderSoft),
              ),
              child: Text(
                name.isNotEmpty ? '$name\n\n${r.toString()}' : r.toString(),
                style: const TextStyle(fontSize: 12, fontFamily: 'monospace', color: AegisColors.textSecondary, height: 1.5),
              ),
            ),
          ),
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(context), child: const Text('OK'))],
      ));
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Row(children: [
          const Icon(Icons.error_outline_rounded, color: AegisColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text('Ошибка: ${e.toString().replaceFirst('Exception: ', '')}')),
        ]),
      ));
    }
  }

  List<dynamic> get _filtered {
    if (_filter == 'all') return _scenarios;
    if (_filter == 'active') return _scenarios.where((s) => s['enabled'] == 1 || s['enabled'] == true).toList();
    if (_filter == 'scheduled') return _scenarios.where((s) => (s['cron_expr']?.toString() ?? '').isNotEmpty).toList();
    return _scenarios;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const BrandedTitle('Сценарии', icon: Icons.play_circle_rounded),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _loading ? null : _load),
          const SizedBox(width: 4),
        ],
      ),
      body: Column(
        children: [
          // Filter chips
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                _filterChip('Все', 'all', _scenarios.length),
                const SizedBox(width: 8),
                _filterChip('Активные', 'active', _scenarios.where((s) => s['enabled'] == 1 || s['enabled'] == true).length),
                const SizedBox(width: 8),
                _filterChip('По расписанию', 'scheduled', _scenarios.where((s) => (s['cron_expr']?.toString() ?? '').isNotEmpty).length),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? ListView(padding: const EdgeInsets.all(16), children: List.generate(5, (_) => const SkeletonCard(height: 110)))
                : _error != null
                    ? ErrorRetry(message: _error!, onRetry: _load)
                    : _filtered.isEmpty
                        ? EmptyState(
                            icon: Icons.play_circle_outline_rounded,
                            title: 'Нет сценариев',
                            description: 'Создайте сценарий в desktop-приложении или измените фильтр',
                            action: OutlinedButton.icon(
                              onPressed: _load,
                              icon: const Icon(Icons.refresh_rounded, size: 16),
                              label: const Text('Обновить'),
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _load,
                            color: AegisColors.accentBlue,
                            backgroundColor: AegisColors.bgElevated,
                            child: ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 100),
                              itemCount: _filtered.length,
                              itemBuilder: (_, i) => _scenarioCard(_filtered[i] as Map),
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(String label, String value, int count) {
    final selected = _filter == value;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => setState(() => _filter = value),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            gradient: selected ? AegisColors.accentGradient : null,
            color: selected ? null : AegisColors.bgCard,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? Colors.transparent : AegisColors.border),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(label, style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : AegisColors.textSecondary,
              fontFamily: 'Inter',
            )),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: selected ? Colors.white.withOpacity(0.25) : AegisColors.bgDeep,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('$count', style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                color: selected ? Colors.white : AegisColors.textTertiary,
                fontFamily: 'Inter',
              )),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _scenarioCard(Map s) {
    final enabled = s['enabled'] == 1 || s['enabled'] == true;
    final cron = s['cron_expr']?.toString() ?? '';
    final category = s['category']?.toString() ?? '';
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
                  AegisColors.accentBlue.withOpacity(0.18),
                  AegisColors.accentPurple.withOpacity(0.14),
                ]),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AegisColors.accentBlue.withOpacity(0.2)),
              ),
              child: const Icon(Icons.play_circle_rounded, color: AegisColors.accentBlue, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(s['name']?.toString() ?? '',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5, fontFamily: 'Inter', color: AegisColors.textPrimary)),
            ),
            PulseDot(color: enabled ? AegisColors.success : AegisColors.textTertiary),
          ]),
          const SizedBox(height: 10),
          Text(s['objective']?.toString() ?? '',
              style: const TextStyle(color: AegisColors.textSecondary, fontSize: 12.5, fontFamily: 'Inter', height: 1.45)),
          const SizedBox(height: 12),
          Wrap(spacing: 6, runSpacing: 6, children: [
            if (category.isNotEmpty)
              _tag(category, icon: Icons.label_outline_rounded),
            if (cron.isNotEmpty)
              _tag(cron, icon: Icons.schedule_rounded, mono: true, color: AegisColors.warning),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            const Spacer(),
            FilledButton.icon(
              onPressed: () => _run(s['id'], s['name']?.toString() ?? ''),
              icon: const Icon(Icons.play_arrow_rounded, size: 18),
              label: const Text('Запустить'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              ),
            ),
          ]),
        ]),
      ),
    );
  }

  Widget _tag(String text, {IconData? icon, bool mono = false, Color? color}) {
    final c = color ?? AegisColors.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withOpacity(0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.withOpacity(0.25)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 11, color: c), const SizedBox(width: 4)],
        Text(text, style: TextStyle(
          fontSize: 10.5,
          color: c,
          fontWeight: FontWeight.w600,
          fontFamily: mono ? 'monospace' : 'Inter',
        )),
      ]),
    );
  }
}
