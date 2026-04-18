import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:aegisops_mobile/src/theme.dart';

import 'package:google_fonts/google_fonts.dart';

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });
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
