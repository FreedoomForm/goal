/// AegisOps Mobile — entry point.
/// Connects to any AegisOps PC-backend via a paired public URL + API key.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'src/services/api_client.dart';
import 'src/services/settings_service.dart';
import 'src/screens/connect_screen.dart';
import 'src/screens/dashboard_screen.dart';
import 'src/screens/scenarios_screen.dart';
import 'src/screens/assistant_screen.dart';
import 'src/screens/planning_screen.dart';
import 'src/screens/mcp_screen.dart';
import 'src/screens/settings_screen.dart';
import 'src/theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SettingsService.instance.load();
  runApp(const ProviderScope(child: AegisOpsApp()));
}

class AegisOpsApp extends StatefulWidget {
  const AegisOpsApp({super.key});
  @override
  State<AegisOpsApp> createState() => _AegisOpsAppState();
}

class _AegisOpsAppState extends State<AegisOpsApp> {
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _router = GoRouter(
      initialLocation: SettingsService.instance.hasCredentials ? '/dashboard' : '/connect',
      redirect: (context, state) {
        final loggedIn = SettingsService.instance.hasCredentials;
        final onConnect = state.uri.path == '/connect';
        if (!loggedIn && !onConnect) return '/connect';
        if (loggedIn && onConnect) return '/dashboard';
        return null;
      },
      routes: [
        GoRoute(path: '/connect', builder: (_, __) => const ConnectScreen()),
        ShellRoute(
          builder: (ctx, state, child) => HomeShell(child: child),
          routes: [
            GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
            GoRoute(path: '/scenarios', builder: (_, __) => const ScenariosScreen()),
            GoRoute(path: '/assistant', builder: (_, __) => const AssistantScreen()),
            GoRoute(path: '/planning', builder: (_, __) => const PlanningScreen()),
            GoRoute(path: '/mcp', builder: (_, __) => const McpScreen()),
            GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'AegisOps Mobile',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: _router,
    );
  }
}

class HomeShell extends StatefulWidget {
  final Widget child;
  const HomeShell({super.key, required this.child});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  final _tabs = const [
    (icon: Icons.dashboard_outlined, label: 'Панель', route: '/dashboard'),
    (icon: Icons.play_circle_outline, label: 'Сценарии', route: '/scenarios'),
    (icon: Icons.chat_bubble_outline, label: 'AI', route: '/assistant'),
    (icon: Icons.account_tree_outlined, label: 'Workflow', route: '/planning'),
    (icon: Icons.extension_outlined, label: 'MCP', route: '/mcp'),
    (icon: Icons.settings_outlined, label: 'Настр.', route: '/settings'),
  ];

  @override
  Widget build(BuildContext context) {
    final loc = GoRouterState.of(context).uri.path;
    final index = _tabs.indexWhere((t) => t.route == loc).clamp(0, _tabs.length - 1);
    return Scaffold(
      body: widget.child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(_tabs[i].route),
        destinations: _tabs.map((t) => NavigationDestination(icon: Icon(t.icon), label: t.label)).toList(),
      ),
    );
  }
}
