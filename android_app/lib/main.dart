/// AegisOps Mobile — entry point.
/// Connects to any AegisOps PC-backend via a paired public URL + API key.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  // Edge-to-edge & transparent system bars for a modern look
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0D1628),
    systemNavigationBarIconBrightness: Brightness.light,
  ));
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

class _NavTab {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final String route;
  const _NavTab(this.icon, this.selectedIcon, this.label, this.route);
}

class _HomeShellState extends State<HomeShell> {
  static const _tabs = <_NavTab>[
    _NavTab(Icons.dashboard_outlined, Icons.dashboard_rounded, 'Панель', '/dashboard'),
    _NavTab(Icons.play_circle_outline, Icons.play_circle_rounded, 'Сценарии', '/scenarios'),
    _NavTab(Icons.chat_bubble_outline, Icons.chat_bubble_rounded, 'AI', '/assistant'),
    _NavTab(Icons.account_tree_outlined, Icons.account_tree_rounded, 'Workflow', '/planning'),
    _NavTab(Icons.extension_outlined, Icons.extension_rounded, 'MCP', '/mcp'),
    _NavTab(Icons.settings_outlined, Icons.settings_rounded, 'Настр.', '/settings'),
  ];

  @override
  Widget build(BuildContext context) {
    final loc = GoRouterState.of(context).uri.path;
    final index = _tabs.indexWhere((t) => t.route == loc).clamp(0, _tabs.length - 1);
    return Scaffold(
      body: widget.child,
      bottomNavigationBar: _CustomNavBar(
        tabs: _tabs,
        currentIndex: index,
        onTap: (i) => context.go(_tabs[i].route),
      ),
    );
  }
}

/// Custom compact nav bar that reliably fits 6 tabs on narrow devices
class _CustomNavBar extends StatelessWidget {
  final List<_NavTab> tabs;
  final int currentIndex;
  final ValueChanged<int> onTap;
  const _CustomNavBar({required this.tabs, required this.currentIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF0D1628),
        border: Border(top: BorderSide(color: AegisColors.borderSoft, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 62,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(tabs.length, (i) {
              final selected = i == currentIndex;
              final t = tabs[i];
              return Expanded(
                child: InkWell(
                  onTap: () => onTap(i),
                  splashColor: AegisColors.accentBlue.withOpacity(0.12),
                  highlightColor: AegisColors.accentBlue.withOpacity(0.08),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOut,
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                          decoration: BoxDecoration(
                            color: selected ? AegisColors.accentBlue.withOpacity(0.16) : Colors.transparent,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Icon(
                            selected ? t.selectedIcon : t.icon,
                            size: 22,
                            color: selected ? AegisColors.accentBlue : AegisColors.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          t.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                            color: selected ? AegisColors.accentBlue : AegisColors.textSecondary,
                            fontFamily: 'Inter',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
