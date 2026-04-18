import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
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
        // Validate selected model exists in the list to prevent DropdownButton crash
        if (_selectedModel != null && !_models.any((m) => m['name'] == _selectedModel)) {
          _selectedModel = _models.isNotEmpty ? _models.first['name'] as String : null;
        }
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
      if (_selectedModel != null) body['model'] = _selectedModel!;
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
      final stream = ApiClient.instance.postSse('/api/assistant/stream', body);

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
      streamingMsg.content += '\nПереключаюсь на обычный режим...';
      streamingMsg.isStreaming = false;
      if (mounted) setState(() {});
      await _sendNormal(prompt);
      _messages.remove(streamingMsg);
      if (mounted) setState(() {});
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
              width: 30, height: 30,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  AegisColors.accentPurple.withOpacity(0.85),
                  AegisColors.accentBlue.withOpacity(0.85),
                ]),
                borderRadius: BorderRadius.circular(9),
                boxShadow: [
                  BoxShadow(color: AegisColors.accentPurple.withOpacity(0.4), blurRadius: 10, offset: const Offset(0, 2)),
                ],
              ),
              child: const Icon(Icons.auto_awesome_rounded, size: 17, color: Colors.white),
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
                style: const TextStyle(color: Color(0xFF59A8FF), fontSize: 11, fontFamily: 'Inter'),
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
                  Text('$_selectedModel', style: const TextStyle(fontSize: 11, color: Color(0xFF59A8FF), fontFamily: 'Inter')),
                  const Spacer(),
                  if (_useStream)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: const Color(0xFF23C483).withOpacity(0.15), borderRadius: BorderRadius.circular(6)),
                      child: Text('STREAM', style: const TextStyle(fontSize: 9, color: Color(0xFF23C483), fontWeight: FontWeight.w700, fontFamily: 'Inter')),
                    ),
                ],
              ),
            ),
          // Messages
          if (_messages.isNotEmpty)
            Expanded(child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
              itemCount: _messages.length,
              itemBuilder: (_, i) => _buildMessage(_messages[i]),
            )),
          if (_loading) const Padding(padding: EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: LinearProgressIndicator(backgroundColor: Color(0xFF24304E))),
          // Quick actions / welcome
          if (_messages.isEmpty)
            Expanded(
              child: _buildWelcome(),
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
                  style: const TextStyle(fontSize: 14, fontFamily: 'Inter'),
                  decoration: InputDecoration(
                    hintText: 'Задайте вопрос AI…',
                    hintStyle: const TextStyle(color: Color(0xFF5E6C88), fontFamily: 'Inter'),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                  onSubmitted: (_) => _send(),
                ),
              )),
              const SizedBox(width: 8),
              Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFF59A8FF), Color(0xFF7C5CFF)]),
                  borderRadius: const BorderRadius.only(
                    topLeft: Radius.circular(16), bottomLeft: Radius.circular(16),
                    topRight: Radius.circular(20), bottomRight: Radius.circular(20),
                  ),
                  boxShadow: [BoxShadow(color: const Color(0xFF59A8FF).withOpacity(0.3), blurRadius: 8)],
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
                          Text('${m.provider ?? ''}${m.model != null ? ' / ${m.model}' : ''}', style: const TextStyle(fontSize: 10, color: Color(0xFF5E6C88), fontFamily: 'Inter')),
                        ],
                      ),
                    ),
                  // Content
                  if (isUser)
                    Text(m.content, style: const TextStyle(fontSize: 14, height: 1.5, fontFamily: 'Inter'))
                  else if (m.isStreaming && m.content.isEmpty)
                    const StreamingDots()
                  else
                    MarkdownBody(data: m.content, shrinkWrap: true, styleSheet: MarkdownStyleSheet(p: const TextStyle(fontSize: 13, height: 1.6, color: Color(0xFFC0D0E8), fontFamily: 'Inter'))),
                  // Streaming cursor
                  if (m.isStreaming && m.content.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text('|', style: const TextStyle(color: Color(0xFF59A8FF), fontWeight: FontWeight.w900, fontSize: 14, fontFamily: 'Inter')),
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

extension _AssistantWelcome on _AssistantScreenState {
  Widget _buildWelcome() {
    final suggestions = [
      (emoji: '📊', title: 'Газовый баланс', prompt: 'Сформируй отчёт по газовому балансу', color: AegisColors.accentBlue),
      (emoji: '💰', title: 'Платежи', prompt: 'Анализ дебиторской задолженности', color: AegisColors.warning),
      (emoji: '🔍', title: 'Риски', prompt: 'Прогноз рисков недопоставки газа', color: AegisColors.danger),
      (emoji: '📈', title: 'Тарифы', prompt: 'Тарифный анализ с точкой безубыточности', color: AegisColors.success),
      (emoji: '🔌', title: 'Коннекторы', prompt: 'Покажи статус всех коннекторов', color: AegisColors.accentPurple),
      (emoji: '📝', title: 'Документы', prompt: 'Краткая сводка по последним документам', color: AegisColors.accentCyan),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 12),
          Center(
            child: Container(
              width: 76, height: 76,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  AegisColors.accentPurple.withOpacity(0.9),
                  AegisColors.accentBlue.withOpacity(0.9),
                ]),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(color: AegisColors.accentPurple.withOpacity(0.4), blurRadius: 24, offset: const Offset(0, 8)),
                ],
              ),
              child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 38),
            ),
          ),
          const SizedBox(height: 18),
          const Center(
            child: Text('Чем могу помочь?',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AegisColors.textPrimary, fontFamily: 'Inter', letterSpacing: -0.3)),
          ),
          const SizedBox(height: 6),
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 32),
              child: Text('Выберите готовый запрос или сформулируйте свой',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: AegisColors.textTertiary, fontFamily: 'Inter', height: 1.5)),
            ),
          ),
          const SizedBox(height: 22),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.65,
            children: suggestions.map((sug) {
              return Material(
                color: Colors.transparent,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () { _ctrl.text = sug.prompt; _send(); },
                  child: Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AegisColors.bgCard,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AegisColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          width: 32, height: 32,
                          decoration: BoxDecoration(
                            color: sug.color.withOpacity(0.14),
                            borderRadius: BorderRadius.circular(9),
                            border: Border.all(color: sug.color.withOpacity(0.25)),
                          ),
                          alignment: Alignment.center,
                          child: Text(sug.emoji, style: const TextStyle(fontSize: 16)),
                        ),
                        Text(sug.title,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AegisColors.textPrimary, fontFamily: 'Inter')),
                        Text(sug.prompt,
                            maxLines: 2, overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 10.5, color: AegisColors.textTertiary, fontFamily: 'Inter', height: 1.35)),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}
