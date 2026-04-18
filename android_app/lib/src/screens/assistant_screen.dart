import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_client.dart';
import '../theme.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});
  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> with TickerProviderStateMixin {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<_Msg> _messages = [];
  bool _loading = false;
  String? _selectedModel;
  List<Map<String, dynamic>> _models = [];
  bool _useStream = true;
  late AnimationController _pulseCtrl;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();
    _loadModels();
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadModels() async {
    try {
      final status = await ApiClient.instance.getJson('/api/ai/status');
      final ollamaModels = (status['ollama']?['models'] as List?) ?? [];
      setState(() {
        _models = ollamaModels.map((m) => {'name': m['name']?.toString() ?? '', 'size': m['size'] ?? 0, 'family': m['family']?.toString() ?? ''}).toList();
        _selectedModel = status['activeModel']?.toString();
      });
    } catch (_) {}
  }

  Future<void> _send() async {
    final t = _ctrl.text.trim();
    if (t.isEmpty || _loading) return;
    setState(() { _messages.add(_Msg(role: 'user', content: t)); _loading = true; _ctrl.clear(); });
    _scrollDown();

    if (_useStream && _selectedModel != null) {
      await _sendStream(t);
    } else {
      await _sendNormal(t);
    }

    setState(() => _loading = false);
    _scrollDown();
  }

  Future<void> _sendNormal(String prompt) async {
    try {
      final body = {'prompt': prompt};
      if (_selectedModel != null) body['model'] = _selectedModel;
      final r = await ApiClient.instance.postJson('/api/assistant', body);
      setState(() { _messages.add(_Msg(role: 'ai', content: r['content']?.toString() ?? '', provider: r['provider']?.toString(), model: r['model']?.toString())); });
    } catch (e) {
      setState(() { _messages.add(_Msg(role: 'ai', content: 'Ошибка: $e')); });
    }
  }

  Future<void> _sendStream(String prompt) async {
    final streamingMsg = _Msg(role: 'ai', content: '', provider: 'ollama', model: _selectedModel, isStreaming: true);
    setState(() { _messages.add(streamingMsg); });

    try {
      final body = {'prompt': prompt, 'model': _selectedModel};
      final stream = await ApiClient.instance.postSse('/api/assistant/stream', body);

      await for (final event in stream) {
        if (event['type'] == 'token' && event['content'] != null) {
          streamingMsg.content += event['content'].toString();
          if (mounted) setState(() {});
          _scrollDown();
        } else if (event['type'] == 'done') {
          streamingMsg.content = event['content']?.toString() ?? streamingMsg.content;
          streamingMsg.isStreaming = false;
          if (mounted) setState(() {});
        } else if (event['type'] == 'error') {
          streamingMsg.content += '\nОшибка: ${event['error']}';
          streamingMsg.isStreaming = false;
          if (mounted) setState(() {});
        }
      }
    } catch (e) {
      streamingMsg.content += '\nОшибка стриминга: $e';
      streamingMsg.isStreaming = false;
      await _sendNormal(prompt);
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent + 100, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      }
    });
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
                color: const Color(0xFF7C5CFF).withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF7C5CFF).withOpacity(0.3)),
              ),
              child: const Icon(Icons.smart_toy, size: 16, color: Color(0xFF7C5CFF)),
            ),
            const SizedBox(width: 10),
            const Text('AI Ассистент'),
          ],
        ),
        actions: [
          // Model selector
          if (_models.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF09101D),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF24304E)),
              ),
              child: DropdownButton<String>(
                value: _selectedModel,
                underline: const SizedBox(),
                icon: const Icon(Icons.arrow_drop_down, color: Color(0xFF59A8FF), size: 18),
                style: GoogleFonts.inter(color: const Color(0xFF59A8FF), fontSize: 11),
                items: _models.map((m) => DropdownMenuItem(
                  value: m['name'] as String,
                  child: Text(m['name'] as String, style: const TextStyle(fontSize: 11)),
                )).toList(),
                onChanged: (v) async {
                  if (v != null) {
                    try {
                      await ApiClient.instance.postJson('/api/ai/models/select', {'model': v, 'provider': 'ollama'});
                      setState(() => _selectedModel = v);
                    } catch (_) {}
                  }
                },
              ),
            ),
          // Stream toggle
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: IconButton(
              icon: Icon(_useStream ? Icons.stream : Icons.stream_outlined, size: 20),
              tooltip: _useStream ? 'Потоковый вывод вкл' : 'Потоковый вывод выкл',
              onPressed: () => setState(() => _useStream = !_useStream),
              color: _useStream ? const Color(0xFF23C483) : const Color(0xFF5E6C88),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Model status bar
          if (_selectedModel != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              color: const Color(0xFF09101D),
              child: Row(
                children: [
                  FadeTransition(
                    opacity: Tween(begin: 1.0, end: 0.4).animate(_pulseCtrl),
                    child: Container(width: 6, height: 6, decoration: const BoxDecoration(color: Color(0xFF59A8FF), shape: BoxShape.circle, boxShadow: [BoxShadow(color: Color(0xFF59A8FF), blurRadius: 6)])),
                  ),
                  const SizedBox(width: 8),
                  Text('$_selectedModel', style: GoogleFonts.inter(fontSize: 11, color: const Color(0xFF59A8FF))),
                  const Spacer(),
                  if (_useStream)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: const Color(0xFF23C483).withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                      child: Text('STREAM', style: GoogleFonts.inter(fontSize: 9, color: const Color(0xFF23C483), fontWeight: FontWeight.w700)),
                    ),
                ],
              ),
            ),
          // Messages
          Expanded(child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.all(12),
            itemCount: _messages.length,
            itemBuilder: (_, i) => _buildMessage(_messages[i]),
          )),
          if (_loading) const Padding(padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: LinearProgressIndicator(backgroundColor: Color(0xFF24304E))),
          // Quick actions
          if (_messages.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  QuickActionChip(label: '📊 Газовый баланс', onTap: () { _ctrl.text = 'Сформируй отчёт по газовому балансу'; _send(); }),
                  QuickActionChip(label: '💰 Платежи', onTap: () { _ctrl.text = 'Анализ дебиторской задолженности'; _send(); }),
                  QuickActionChip(label: '🔍 Риски', onTap: () { _ctrl.text = 'Прогноз рисков недопоставки газа'; _send(); }),
                  QuickActionChip(label: '📈 Тарифы', onTap: () { _ctrl.text = 'Тарифный анализ с точкой безубыточности'; _send(); }),
                  QuickActionChip(label: '🔌 Коннекторы', onTap: () { _ctrl.text = 'Покажи статус всех коннекторов'; _send(); }),
                ],
              ),
            ),
          // Input
          SafeArea(child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
            child: Row(children: [
              Expanded(child: Container(
                decoration: BoxDecoration(
                  color: const Color(0xFF0B1220),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF24304E)),
                ),
                child: TextField(
                  controller: _ctrl, minLines: 1, maxLines: 4,
                  style: GoogleFonts.inter(fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Задайте вопрос AI…',
                    hintStyle: GoogleFonts.inter(color: const Color(0xFF5E6C88)),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                  onSubmitted: (_) => _send(),
                ),
              )),
              const SizedBox(width: 8),
              Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFF59A8FF), Color(0xFF7C5CFF)]),
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(16), bottomLeft: Radius.circular(16),
                    topRight: Radius.circular(20), bottomRight: Radius.circular(20),
                  ),
                  boxShadow: [BoxShadow(color: Color(0xFF59A8FF).withOpacity(0.3), blurRadius: 8)],
                ),
                child: IconButton(
                  onPressed: _loading ? null : _send,
                  icon: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                  padding: const EdgeInsets.all(14),
                ),
              ),
            ]),
          )),
        ],
      ),
    );
  }

  Widget _buildMessage(_Msg m) {
    final isUser = m.role == 'user';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        textDirection: isUser ? TextDirection.rtl : TextDirection.ltr,
        children: [
          // Avatar
          Container(
            width: 30, height: 30,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isUser ? null : const Color(0xFF7C5CFF).withOpacity(0.2),
              gradient: isUser ? const LinearGradient(colors: [Color(0xFF59A8FF), Color(0xFF7C5CFF)]) : null,
              border: isUser ? null : Border.all(color: const Color(0xFF7C5CFF).withOpacity(0.3)),
            ),
            child: Center(child: Text(isUser ? '👤' : '🤖', style: const TextStyle(fontSize: 14))),
          ),
          const SizedBox(width: 8),
          // Bubble
          Flexible(
            child: Container(
              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isUser ? const Color(0xFF59A8FF).withOpacity(0.15) : const Color(0xFF121B31),
                border: Border.all(
                  color: isUser ? const Color(0xFF59A8FF).withOpacity(0.3) : const Color(0xFF24304E),
                ),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isUser ? 16 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 16),
                ),
                boxShadow: isUser
                  ? [BoxShadow(color: const Color(0xFF59A8FF).withOpacity(0.1), blurRadius: 8)]
                  : null,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Provider tag
                  if (!isUser && (m.provider != null || m.model != null))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          FadeTransition(
                            opacity: Tween(begin: 1.0, end: 0.4).animate(_pulseCtrl),
                            child: Container(width: 5, height: 5, decoration: const BoxDecoration(color: Color(0xFF59A8FF), shape: BoxShape.circle)),
                          ),
                          const SizedBox(width: 5),
                          Text('${m.provider ?? ''}${m.model != null ? ' / ${m.model}' : ''}', style: GoogleFonts.inter(fontSize: 10, color: const Color(0xFF5E6C88))),
                        ],
                      ),
                    ),
                  // Content
                  if (isUser)
                    Text(m.content, style: GoogleFonts.inter(fontSize: 14, height: 1.5))
                  else if (m.isStreaming && m.content.isEmpty)
                    const StreamingDots()
                  else
                    MarkdownBody(data: m.content, shrinkWrap: true, styleSheet: MarkdownStyleSheet(p: GoogleFonts.inter(fontSize: 13, height: 1.6, color: const Color(0xFFC0D0E8)))),
                  // Streaming cursor
                  if (m.isStreaming && m.content.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('|', style: GoogleFonts.inter(color: const Color(0xFF59A8FF), fontWeight: FontWeight.w900, fontSize: 14)),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Msg {
  final String role;
  String content;
  final String? provider;
  final String? model;
  bool isStreaming;

  _Msg({required this.role, required this.content, this.provider, this.model, this.isStreaming = false});
}
