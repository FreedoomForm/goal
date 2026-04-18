import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/api_client.dart';
import '../theme.dart';

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
      setState(() { _data = d is Map<String, dynamic> ? d : <String, dynamic>{}; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString().replaceFirst('Exception: ', ''); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const BrandedTitle('Панель управления', icon: Icons.dashboard_rounded),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Обновить',
            onPressed: _loading ? null : _load,
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: _loading
          ? _buildSkeleton()
          : _error != null
              ? ErrorRetry(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  color: AegisColors.accentBlue,
                  backgroundColor: AegisColors.bgElevated,
                  child: _buildContent()),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.go('/assistant'),
        icon: const Icon(Icons.auto_awesome_rounded),
        label: const Text('AI Чат', style: TextStyle(fontWeight: FontWeight.w700, fontFamily: 'Inter')),
        backgroundColor: AegisColors.accentBlue,
      ),
    );
  }

  Widget _buildSkeleton() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SkeletonCard(height: 140),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: SkeletonCard(height: 72)),
          const SizedBox(width: 8),
          Expanded(child: SkeletonCard(height: 72)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: SkeletonCard(height: 72)),
          const SizedBox(width: 8),
          Expanded(child: SkeletonCard(height: 72)),
        ]),
        const SizedBox(height: 20),
        const SkeletonCard(height: 80),
        const SkeletonCard(height: 80),
        const SkeletonCard(height: 80),
      ],
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
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
      children: [
        // Hero card with gradient
        Container(
          decoration: BoxDecoration(
            gradient: AegisColors.heroGradient,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AegisColors.accentBlue.withOpacity(0.18)),
            boxShadow: [
              BoxShadow(color: AegisColors.accentBlue.withOpacity(0.10), blurRadius: 24, offset: const Offset(0, 6)),
            ],
          ),
          padding: const EdgeInsets.all(22),
          child: Stack(
            children: [
              // Decorative gradient blob
              Positioned(
                top: -30, right: -30,
                child: Container(
                  width: 140, height: 140,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(colors: [AegisColors.accentBlue.withOpacity(0.16), Colors.transparent]),
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      gradient: AegisColors.accentGradient,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(color: AegisColors.accentBlue.withOpacity(0.4), blurRadius: 10),
                      ],
                    ),
                    child: const Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.flash_on_rounded, size: 11, color: Colors.white),
                      SizedBox(width: 4),
                      Text('On-prem • 100% Локально',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white, fontFamily: 'Inter', letterSpacing: 0.3)),
                    ]),
                  ),
                  const SizedBox(height: 14),
                  Text(hero['title']?.toString() ?? 'AegisOps',
                      style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white, fontFamily: 'Inter', letterSpacing: -0.5, height: 1.1)),
                  const SizedBox(height: 6),
                  Text(hero['subtitle']?.toString() ?? 'AI-платформа для корпоративных систем',
                      style: const TextStyle(fontSize: 13, color: AegisColors.textSecondary, height: 1.5, fontFamily: 'Inter')),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        // Stats
        _statsGrid([
          _StatItem('Коннекторы', connectors.length, Icons.cable_rounded, AegisColors.accentBlue),
          _StatItem('Сценарии', scenarios.length, Icons.play_circle_rounded, AegisColors.accentPurple),
          _StatItem('Модули', modules.length, Icons.extension_rounded, AegisColors.success),
          _StatItem('Документы', docs.length, Icons.description_rounded, AegisColors.warning),
        ]),
        const SizedBox(height: 22),
        _sectionTitle('АКТИВНЫЕ СЦЕНАРИИ', Icons.bolt_rounded),
        if (scenarios.isEmpty)
          _inlineEmpty('Нет активных сценариев', Icons.play_circle_outline_rounded)
        else
          ...scenarios.take(5).map((s) => _scenarioCard(s)),
        if (scenarios.length > 5) ...[
          const SizedBox(height: 8),
          Center(
            child: TextButton.icon(
              onPressed: () => context.go('/scenarios'),
              icon: const Icon(Icons.arrow_forward_rounded, size: 16),
              label: Text('Все сценарии (${scenarios.length})'),
            ),
          ),
        ],
        const SizedBox(height: 22),
        _sectionTitle('МОДУЛИ ПЛАТФОРМЫ', Icons.extension_rounded),
        if (modules.isEmpty)
          _inlineEmpty('Нет модулей', Icons.extension_outlined)
        else
          ...modules.map((m) => _moduleCard(m)),
      ],
    );
  }

  Widget _inlineEmpty(String text, IconData icon) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AegisColors.bgCard.withOpacity(0.5),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AegisColors.borderSoft),
      ),
      child: Row(children: [
        Icon(icon, color: AegisColors.textTertiary, size: 22),
        const SizedBox(width: 12),
        Expanded(
          child: Text(text, style: const TextStyle(color: AegisColors.textTertiary, fontSize: 13, fontFamily: 'Inter')),
        ),
      ]),
    );
  }

  Widget _statsGrid(List<_StatItem> items) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 2.4,
      children: items.map((item) => Container(
        decoration: BoxDecoration(
          color: AegisColors.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AegisColors.border),
        ),
        child: Stack(
          children: [
            // Gradient top line
            Positioned(
              top: 0, left: 0, right: 0,
              child: Container(height: 2.5, decoration: BoxDecoration(
                gradient: LinearGradient(colors: [item.color, item.color.withOpacity(0.2)]),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              )),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 13, 14, 11),
              child: Row(children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: item.color.withOpacity(0.14),
                    borderRadius: BorderRadius.circular(11),
                    border: Border.all(color: item.color.withOpacity(0.22)),
                  ),
                  child: Icon(item.icon, color: item.color, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(item.label, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AegisColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w600, fontFamily: 'Inter')),
                    const SizedBox(height: 2),
                    Text(item.value.toString(),
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white, fontFamily: 'Inter', letterSpacing: -0.5, height: 1.1)),
                  ],
                )),
              ]),
            ),
          ],
        ),
      )).toList(),
    );
  }

  Widget _scenarioCard(dynamic s) {
    final enabled = s['enabled'] == 1 || s['enabled'] == true;
    final category = s['category']?.toString() ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AegisColors.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AegisColors.border),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _runScenario(s['id']),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(
                width: 42, height: 42,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AegisColors.accentBlue.withOpacity(0.15), AegisColors.accentPurple.withOpacity(0.10)],
                  ),
                  borderRadius: BorderRadius.circular(11),
                  border: Border.all(color: AegisColors.accentBlue.withOpacity(0.20)),
                ),
                child: const Icon(Icons.play_circle_rounded, color: AegisColors.accentBlue, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s['name']?.toString() ?? '',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, fontFamily: 'Inter', color: AegisColors.textPrimary)),
                  const SizedBox(height: 3),
                  Text(s['objective']?.toString() ?? '',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AegisColors.textSecondary, fontSize: 11.5, fontFamily: 'Inter')),
                  if (category.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: AegisColors.borderSoft),
                      ),
                      child: Text(category, style: const TextStyle(fontSize: 10, color: AegisColors.textTertiary, fontFamily: 'Inter', fontWeight: FontWeight.w600)),
                    ),
                  ],
                ],
              )),
              const SizedBox(width: 8),
              PulseDot(color: enabled ? AegisColors.success : AegisColors.textTertiary),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _moduleCard(dynamic m) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: AegisColors.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AegisColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: AegisColors.bgSurface,
              borderRadius: BorderRadius.circular(11),
              border: Border.all(color: AegisColors.borderSoft),
            ),
            alignment: Alignment.center,
            child: Text(m['icon']?.toString() ?? '📊', style: const TextStyle(fontSize: 22)),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(m['name']?.toString() ?? '',
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, fontFamily: 'Inter', color: AegisColors.textPrimary)),
              const SizedBox(height: 2),
              Text(m['description']?.toString() ?? '',
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AegisColors.textSecondary, fontSize: 12, fontFamily: 'Inter', height: 1.35)),
            ],
          )),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AegisColors.success.withOpacity(0.14),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: AegisColors.success.withOpacity(0.25)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 5, height: 5, decoration: const BoxDecoration(color: AegisColors.success, shape: BoxShape.circle)),
              const SizedBox(width: 4),
              Text(m['status']?.toString() ?? 'active',
                  style: const TextStyle(fontSize: 10, color: AegisColors.success, fontWeight: FontWeight.w700, fontFamily: 'Inter')),
            ]),
          ),
        ]),
      ),
    );
  }

  Future<void> _runScenario(dynamic id) async {
    if (id == null) return;
    final ok = await showDialog<bool>(context: context, builder: (_) => AlertDialog(
      title: const Text('Запустить сценарий?'),
      content: const Text('Сценарий будет выполнен с использованием AI. Это может занять некоторое время.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Отмена')),
        FilledButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Запустить'),
        ),
      ],
    ));
    if (ok != true) return;
    ScaffoldMessenger.of(context).removeCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Row(children: [
        SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AegisColors.accentBlue)),
        SizedBox(width: 12),
        Text('Запускаем сценарий...'),
      ]),
      duration: Duration(seconds: 3),
    ));
    try {
      await ApiClient.instance.postJson('/api/scenarios/$id/run', {});
      if (!mounted) return;
      ScaffoldMessenger.of(context).removeCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Row(children: [
          Icon(Icons.check_circle_rounded, color: AegisColors.success, size: 20),
          SizedBox(width: 10),
          Text('Готово'),
        ]),
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).removeCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Row(children: [
          const Icon(Icons.error_outline_rounded, color: AegisColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(child: Text('Ошибка: ${e.toString().replaceFirst('Exception: ', '')}')),
        ]),
      ));
    }
  }

  Widget _sectionTitle(String t, IconData icon) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 6, 4, 10),
    child: Row(children: [
      Icon(icon, size: 14, color: AegisColors.accentBlue),
      const SizedBox(width: 6),
      Text(t, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AegisColors.accentBlue, letterSpacing: 1.5, fontFamily: 'Inter')),
      const SizedBox(width: 10),
      Expanded(child: Container(height: 1, color: AegisColors.borderSoft)),
    ]),
  );
}

class _StatItem {
  final String label;
  final int value;
  final IconData icon;
  final Color color;
  _StatItem(this.label, this.value, this.icon, this.color);
}
