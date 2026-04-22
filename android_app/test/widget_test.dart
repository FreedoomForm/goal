import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aegisops_mobile/src/theme.dart';

void main() {
  test('theme builds without errors', () {
    final t = buildTheme();
    expect(t.useMaterial3, isTrue);
    // Neobrutalism theme uses a light canvas (#FFF8EB).
    expect(t.brightness, Brightness.light);
  });

  testWidgets('basic material app renders', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: const Scaffold(body: Center(child: Text('AegisOps'))),
    ));
    expect(find.text('AegisOps'), findsOneWidget);
  });

  testWidgets('NeoButton renders and responds to tap', (tester) async {
    var tapped = 0;
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: Scaffold(
        body: Center(
          child: NeoButton(
            onPressed: () => tapped++,
            child: const Text('TAP'),
          ),
        ),
      ),
    ));
    expect(find.text('TAP'), findsOneWidget);
    await tester.tap(find.text('TAP'));
    await tester.pump();
    expect(tapped, 1);
  });

  testWidgets('NeoCard wraps its child', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: const Scaffold(
        body: Center(
          child: NeoCard(child: Text('hello')),
        ),
      ),
    ));
    expect(find.text('hello'), findsOneWidget);
  });
}
