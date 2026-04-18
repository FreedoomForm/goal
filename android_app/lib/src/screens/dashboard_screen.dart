import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
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
      setState(() { _data = d as Map<String, dynamic>; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF59A8FF), Color(0xFF7C5CFF)]),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.dashboard_outlined, size: 16, color: Colors.white),
            ),
            const SizedBox(width: 10),
            const Text('Панель управления'),
          ],
        ),
        actions: [IconButton(icon: const Icon(Icons.refresh_rounded), onPressed: _load)],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF59A8FF)))
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!, style: const TextStyle(color: Colors.redAccent))))
              : RefreshIndicator(onRefresh: _load, color: const Color(0xFF59A8FF), child: _buildContent()),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.of(context).pushNamed('/assistant'),
        gradient: const LinearGradient(colors: [Color(0xFF59A8FF), Color(0xFF7C5CFF)]),
        child: const Icon(Icons.chat_bubble_outline, color: Colors.white),
      ),
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
        // Hero card with gradient
        Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF111B2E), Color(0xFF162040)]),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF59A8FF).withOpacity(0.15)),
            boxShadow: [BoxShadow(color: const Color(0xFF59A8FF).withOpacity(0.08), blurRadius: 20)],
          ),
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF59A8FF), Color(0xFF7C5CFF)]),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('⚡ On-prem • 100% Локально', style: GoogleFonts.inter(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.white)),
              ),
              const SizedBox(height: 12),
              Text(hero['title']?.toString() ?? 'AegisOps', style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
              const SizedBox(height: 4),
              Text(hero['subtitle']?.toString() ?? '', style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFF8EA1C9), height: 1.5)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Stats with gradient top line
        _statsGrid([
          _StatItem('Коннекторы', connectors.length, Icons.cable, const Color(0xFF59A8FF)),
          _StatItem('Сценарии', scenarios.length, Icons.play_circle, const Color(0xFF7C5CFF)),
          _StatItem('Модули', modules.length, Icons.extension, const Color(0xFF23C483)),
          _StatItem('Документы', docs.length, Icons.description, const Color(0xFFFFB347)),
        ]),
        const SizedBox(height: 20),
        _sectionTitle('🔧 Активные сценарии'),
        ...scenarios.take(5).map((s) => _scenarioCard(s)),
        const SizedBox(height: 20),
        _sectionTitle('📦 Модули платформы'),
        ...modules.map((m) => _moduleCard(m)),
      ],
    );
  }

  Widget _statsGrid(List<_StatItem> items) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 8,
      crossAxisSpacing: 8,
      childAspectRatio: 2.5,
      children: items.map((item) => Container(
        decoration: BoxDecoration(
          color: const Color(0xFF121B31),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFF24304E)),
        ),
        child: Stack(
          children: [
            // Gradient top line
            Positioned(
              top: 0, left: 0, right: 0,
              child: Container(height: 2, decoration: BoxDecoration(
                gradient: LinearGradient(colors: [item.color, item.color.withOpacity(0.3)]),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
              )),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
              child: Row(children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: item.color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(item.icon, color: item.color, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(item.label, style: GoogleFonts.inter(color: const Color(0xFF8EA1C9), fontSize: 11, fontWeight: FontWeight.w500)),
                  Text(item.value.toString(), style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
                ])),
              ]),
            ),
          ],
        ),
      )).toList(),
    );
  }

  Widget _scenarioCard(dynamic s) {
    final enabled = s['enabled'] == 1 || s['enabled'] == true;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF121B31),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF24304E)),
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
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: const Color(0xFF59A8FF).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.play_circle_outline, color: Color(0xFF59A8FF)),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s['name']?.toString() ?? '', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14)),
                  const SizedBox(height: 2),
                  Text(s['objective']?.toString() ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.inter(color: const Color(0xFF8EA1C9), fontSize: 11)),
                ],
              )),
              PulseDot(color: enabled ? const Color(0xFF23C483) : const Color(0xFF5E6C88)),
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
        color: const Color(0xFF121B31),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF24304E)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          Text(m['icon']?.toString() ?? '📊', style: const TextStyle(fontSize: 28)),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(m['name']?.toString() ?? '', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 2),
              Text(m['description']?.toString() ?? '', maxLines: 2, overflow: TextOverflow.ellipsis, style: GoogleFonts.inter(color: const Color(0xFF8EA1C9), fontSize: 12)),
            ],
          )),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFF23C483).withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(m['status']?.toString() ?? 'active', style: GoogleFonts.inter(fontSize: 10, color: const Color(0xFF23C483), fontWeight: FontWeight.w600)),
          ),
        ]),
      ),
    );
  }

  Future<void> _runScenario(dynamic id) async {
    if (id == null) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Запускаем сценарий...'), backgroundColor: Color(0xFF162040)));
    try {
      await ApiClient.instance.postJson('/api/scenarios/$id/run', {});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Готово'), backgroundColor: Color(0xFF23C483)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Ошибка: $e'), backgroundColor: const Color(0xFFFF6A6A)));
    }
  }

  Widget _sectionTitle(String t) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
    child: Text(t, style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w700, color: const Color(0xFFB2D6FF), letterSpacing: 0.5)),
  );
}

class _StatItem {
  final String label;
  final int value;
  final IconData icon;
  final Color color;
  _StatItem(this.label, this.value, this.icon, this.color);
}
