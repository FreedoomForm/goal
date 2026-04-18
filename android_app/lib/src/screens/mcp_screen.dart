import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../theme.dart';

class McpScreen extends StatefulWidget {
  const McpScreen({super.key});
  @override
  State<McpScreen> createState() => _McpScreenState();
}

class _McpScreenState extends State<McpScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final raw = await ApiClient.instance.getJson('/api/mcp/servers');
      _data = raw is Map<String, dynamic> ? raw : {'persisted': [], 'running': []};
    } catch (e) {
      _data = {'persisted': [], 'running': []};
      _error = e.toString().replaceFirst('Exception: ', '');
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _action(String name, String action) async {
    try {
      if (action == 'start') await ApiClient.instance.postJson('/api/mcp/servers/$name/start', {});
      if (action == 'stop') await ApiClient.instance.postJson('/api/mcp/servers/$name/stop', {});
      if (!mounted) return;
      ScaffoldMessenger.of(context).removeCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Row(children: [
          Icon(action == 'start' ? Icons.play_arrow_rounded : Icons.stop_rounded,
              color: action == 'start' ? AegisColors.success : AegisColors.warning, size: 18),
          const SizedBox(width: 8),
          Text('$name: ${action == 'start' ? 'запуск' : 'остановка'}'),
        ]),
      ));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Ошибка: ${e.toString().replaceFirst('Exception: ', '')}'),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final persisted = (_data?['persisted'] as List? ?? []);
    final running = Map.fromEntries((_data?['running'] as List? ?? [])
        .map((r) => MapEntry(r is Map ? (r['name']?.toString() ?? '') : '', r is Map ? r : <dynamic, dynamic>{})));

    return Scaffold(
      appBar: AppBar(
        title: const BrandedTitle('MCP серверы', icon: Icons.extension_rounded),
        actions: [
          IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _loading ? null : _load),
          const SizedBox(width: 4),
        ],
      ),
      body: _loading
          ? ListView(padding: const EdgeInsets.all(16), children: List.generate(4, (_) => const SkeletonCard(height: 120)))
          : RefreshIndicator(
              onRefresh: _load,
              color: AegisColors.accentBlue,
              backgroundColor: AegisColors.bgElevated,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                children: [
                  // Info banner
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AegisColors.accentBlue.withOpacity(0.07),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AegisColors.accentBlue.withOpacity(0.2)),
                    ),
                    child: Row(children: [
                      const Icon(Icons.info_outline_rounded, color: AegisColors.accentBlue, size: 20),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Model Context Protocol — стандарт интеграции AI с инструментами. Серверы запускаются на ПК.',
                          style: TextStyle(color: AegisColors.textSecondary, fontSize: 12.5, fontFamily: 'Inter', height: 1.45),
                        ),
                      ),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  if (_error != null && persisted.isEmpty)
                    ErrorRetry(message: _error!, onRetry: _load)
                  else if (persisted.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 40),
                      child: EmptyState(
                        icon: Icons.extension_outlined,
                        title: 'Нет зарегистрированных MCP серверов',
                        description: 'Добавьте их в desktop-приложении AegisOps на вкладке "MCP серверы"',
                      ),
                    )
                  else
                    ...persisted.map((s) {
                      final r = running[s['name']?.toString() ?? ''];
                      final isRunning = r != null && (r['running'] == true) && (r['initialized'] == true);
                      final tools = (r?['tools'] as List?) ?? [];
                      return _serverCard(s as Map, isRunning, tools);
                    }),
                ],
              ),
            ),
    );
  }

  Widget _serverCard(Map s, bool isRunning, List tools) {
    final color = isRunning ? AegisColors.success : AegisColors.textTertiary;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AegisColors.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isRunning ? AegisColors.success.withOpacity(0.25) : AegisColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: color.withOpacity(0.14),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: color.withOpacity(0.25)),
              ),
              child: Icon(Icons.extension_rounded, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s['name']?.toString() ?? '',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, fontFamily: 'Inter', color: AegisColors.textPrimary)),
                  const SizedBox(height: 2),
                  Text('preset: ${s['preset']}',
                      style: const TextStyle(color: AegisColors.textTertiary, fontSize: 11, fontFamily: 'monospace')),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: color.withOpacity(0.14),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: color.withOpacity(0.3)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (isRunning) const PulseDot(color: AegisColors.success, size: 6)
                else Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                const SizedBox(width: 5),
                Text(isRunning ? 'running' : 'stopped',
                    style: TextStyle(fontSize: 10.5, color: color, fontWeight: FontWeight.w700, fontFamily: 'Inter')),
              ]),
            ),
          ]),
          if (tools.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AegisColors.bgDeep,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AegisColors.borderSoft),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Icons.build_rounded, size: 12, color: AegisColors.accentBlue),
                  const SizedBox(width: 5),
                  Text('Инструменты (${tools.length})',
                      style: const TextStyle(fontSize: 10.5, color: AegisColors.accentBlue, fontWeight: FontWeight.w700, fontFamily: 'Inter', letterSpacing: 0.5)),
                ]),
                const SizedBox(height: 6),
                ...tools.take(4).map((t) => Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text('• ${t['name']}',
                      style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: AegisColors.textSecondary)),
                )),
                if (tools.length > 4)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text('…и ещё ${tools.length - 4}',
                        style: const TextStyle(fontSize: 10.5, color: AegisColors.textTertiary, fontFamily: 'Inter', fontStyle: FontStyle.italic)),
                  ),
              ]),
            ),
          ],
          const SizedBox(height: 12),
          Row(children: [
            const Spacer(),
            if (!isRunning)
              FilledButton.icon(
                onPressed: () => _action(s['name'].toString(), 'start'),
                icon: const Icon(Icons.play_arrow_rounded, size: 16),
                label: const Text('Запустить'),
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8)),
              ),
            if (isRunning)
              OutlinedButton.icon(
                onPressed: () => _action(s['name'].toString(), 'stop'),
                icon: const Icon(Icons.stop_rounded, size: 16, color: AegisColors.warning),
                label: const Text('Остановить', style: TextStyle(color: AegisColors.warning)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AegisColors.warning),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
              ),
          ]),
        ]),
      ),
    );
  }
}
