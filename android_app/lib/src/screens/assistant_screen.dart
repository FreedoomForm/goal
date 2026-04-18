import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../services/api_client.dart';

class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});
  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<_Msg> _messages = [];
  bool _loading = false;

  Future<void> _send() async {
    final t = _ctrl.text.trim();
    if (t.isEmpty || _loading) return;
    setState(() { _messages.add(_Msg(role: 'user', content: t)); _loading = true; _ctrl.clear(); });
    _scrollDown();
    try {
      final r = await ApiClient.instance.postJson('/api/assistant', {'prompt': t});
      setState(() { _messages.add(_Msg(role: 'ai', content: r['content']?.toString() ?? '', provider: r['provider']?.toString())); });
    } catch (e) {
      setState(() { _messages.add(_Msg(role: 'ai', content: 'Ошибка: $e')); });
    } finally {
      setState(() => _loading = false);
      _scrollDown();
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
      appBar: AppBar(title: const Text('AI Ассистент')),
      body: Column(
        children: [
          Expanded(child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.all(12),
            itemCount: _messages.length,
            itemBuilder: (_, i) {
              final m = _messages[i];
              final isUser = m.role == 'user';
              return Align(
                alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.85),
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isUser ? const Color(0xFF59A8FF).withValues(alpha: 0.15) : const Color(0xFF121B31),
                    border: Border.all(color: isUser ? const Color(0xFF59A8FF) : const Color(0xFF24304E)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: isUser ? Text(m.content) : MarkdownBody(data: m.content, shrinkWrap: true),
                ),
              );
            },
          )),
          if (_loading) const Padding(padding: EdgeInsets.all(8), child: LinearProgressIndicator()),
          SafeArea(child: Padding(
            padding: const EdgeInsets.all(8),
            child: Row(children: [
              Expanded(child: TextField(
                controller: _ctrl, minLines: 1, maxLines: 4,
                decoration: const InputDecoration(hintText: 'Задайте вопрос AI…', contentPadding: EdgeInsets.all(12)),
                onSubmitted: (_) => _send(),
              )),
              const SizedBox(width: 8),
              FilledButton(onPressed: _loading ? null : _send, child: const Padding(padding: EdgeInsets.all(12), child: Icon(Icons.send))),
            ]),
          )),
        ],
      ),
    );
  }
}

class _Msg { final String role; final String content; final String? provider; _Msg({required this.role, required this.content, this.provider}); }
