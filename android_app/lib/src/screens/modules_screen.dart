import 'package:flutter/material.dart';
import '../services/api_client.dart';

class ModulesScreen extends StatefulWidget {
  const ModulesScreen({super.key});
  @override
  State<ModulesScreen> createState() => _ModulesScreenState();
}

class _ModulesScreenState extends State<ModulesScreen> {
  Map<String, dynamic>? _moduleResults;
  bool _loading = false;
  String? _activeModule;

  static const _modules = [
    {'code': 'gas_balance', 'name': 'Газовый баланс', 'icon': '⛽', 'color': Color(0xFF23C483), 'desc': 'Прогноз баланса газа, ПХГ, импорт/экспорт'},
    {'code': 'consumption', 'name': 'Потребление', 'icon': '📈', 'color': Color(0xFF59A8FF), 'desc': 'Дисциплина потребления, перебор/недобор'},
    {'code': 'payments', 'name': 'Платежи', 'icon': '💰', 'color': Color(0xFFFFB347), 'desc': 'ДЗ/КЗ, платёжеспособность, пени'},
    {'code': 'tariffs', 'name': 'Тарифы', 'icon': '📊', 'color': Color(0xFF7C5CFF), 'desc': 'Безубыточность, субсидии, расщепление'},
    {'code': 'risks', 'name': 'Риски', 'icon': '🔍', 'color': Color(0xFFFF6A6A), 'desc': 'VaR, регрессионный анализ, митигация'},
  ];

  Future<void> _runModule(String code) async {
    setState(() { _loading = true; _activeModule = code; _moduleResults = null; });
    try {
      // Server accepts both hyphen and underscore formats: /api/modules/gas-balance or /api/modules/gas_balance
      final result = await ApiClient.instance.getJson('/api/modules/$code');
      setState(() { _moduleResults = result as Map<String, dynamic>; _loading = false; });
    } catch (e) {
      setState(() { _loading = false; });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Ошибка: $e'),
          backgroundColor: const Color(0xFFFF6A6A),
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ИИ-Модули GasAI')),
      body: Column(
        children: [
          // Module buttons
          SizedBox(
            height: 110,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.all(12),
              children: _modules.map((m) => Padding(
                padding: const EdgeInsets.only(right: 10),
                child: _ModuleCard(
                  module: m,
                  isActive: _activeModule == m['code'],
                  isLoading: _loading && _activeModule == m['code'],
                  onTap: () => _runModule(m['code'] as String),
                ),
              )).toList(),
            ),
          ),
          const Divider(height: 1),
          // Results
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _moduleResults != null
                    ? _ModuleResultView(data: _moduleResults!)
                    : const Center(child: Text('Выберите модуль для анализа', style: TextStyle(color: Colors.white38))),
          ),
        ],
      ),
    );
  }
}

class _ModuleCard extends StatelessWidget {
  final Map module;
  final bool isActive;
  final bool isLoading;
  final VoidCallback onTap;

  const _ModuleCard({required this.module, required this.isActive, required this.isLoading, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isLoading ? null : onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 100,
        decoration: BoxDecoration(
          color: isActive ? (module['color'] as Color).withOpacity(0.2) : const Color(0xFF121B31),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: isActive ? (module['color'] as Color) : const Color(0xFF24304E)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            isLoading
                ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(module['icon'] as String, style: const TextStyle(fontSize: 28)),
            const SizedBox(height: 6),
            Text(module['name'] as String, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}

class _ModuleResultView extends StatelessWidget {
  final Map<String, dynamic> data;
  const _ModuleResultView({required this.data});

  @override
  Widget build(BuildContext context) {
    final analysis = data['analysis'] as Map? ?? {};
    final content = analysis['content']?.toString() ?? 'Нет данных';
    final provider = analysis['provider']?.toString() ?? 'unknown';
    final summary = data['summary'] as Map? ?? {};
    final gasBalance = data['gasBalance'] as Map? ?? {};

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Header
        Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text(data['moduleName']?.toString() ?? '', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const Spacer(),
              Chip(label: Text(provider, style: const TextStyle(fontSize: 10)), visualDensity: VisualDensity.compact),
            ]),
            const SizedBox(height: 4),
            Text(data['timestamp']?.toString() ?? '', style: const TextStyle(color: Colors.white38, fontSize: 12)),
          ],
        ))),
        const SizedBox(height: 8),
        // Summary cards
        if (summary.isNotEmpty) ...[
          _sectionTitle('Сводка'),
          Wrap(spacing: 8, runSpacing: 8, children: summary.entries.map((e) => Chip(
            label: Text('${e.key}: ${e.value}', style: const TextStyle(fontSize: 11)),
            backgroundColor: const Color(0xFF09101D),
          )).toList()),
          const SizedBox(height: 12),
        ],
        // Gas Balance specific
        if (gasBalance.isNotEmpty) ...[
          _sectionTitle('Газовый баланс'),
          Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(
            children: [
              _balanceRow('Поступление', gasBalance['incoming']?['total'] ?? 0),
              _balanceRow('Расход', gasBalance['outgoing']?['total'] ?? 0),
              const Divider(),
              _balanceRow('САЛЬДО', gasBalance['balance'] ?? 0, bold: true),
            ],
          ))),
          const SizedBox(height: 12),
        ],
        // AI Analysis
        _sectionTitle('AI-Анализ'),
        Card(child: Padding(padding: const EdgeInsets.all(16), child: SelectableText(
          content,
          style: const TextStyle(fontSize: 13, height: 1.5),
        ))),
      ],
    );
  }

  Widget _balanceRow(String label, dynamic value, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Text(label, style: TextStyle(fontSize: 13, fontWeight: bold ? FontWeight.w700 : FontWeight.normal, color: bold ? Colors.white : Colors.white70)),
        const Spacer(),
        Text('$value млн м³', style: TextStyle(fontSize: 14, fontWeight: bold ? FontWeight.w700 : FontWeight.normal, color: bold ? (value >= 0 ? const Color(0xFF23C483) : const Color(0xFFFF6A6A)) : Colors.white)),
      ]),
    );
  }

  Widget _sectionTitle(String t) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
    child: Text(t, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Color(0xFFB2D6FF), letterSpacing: 1)),
  );
}
