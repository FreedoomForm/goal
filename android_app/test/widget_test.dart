import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aegisops_mobile/src/theme.dart';

void main() {
  test('theme builds without errors', () {
    final t = buildTheme();
    expect(t.useMaterial3, isTrue);
    expect(t.brightness, Brightness.dark);
  });

  testWidgets('basic material app renders', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: const Scaffold(body: Center(child: Text('AegisOps'))),
    ));
    expect(find.text('AegisOps'), findsOneWidget);
  });
}
