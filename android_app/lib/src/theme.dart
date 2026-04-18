import 'package:flutter/material.dart';

/// Brand colors — keep in sync with Windows app styles.css
class AegisColors {
  static const bgDeep = Color(0xFF050A15);
  static const bgBase = Color(0xFF0B1220);
  static const bgSurface = Color(0xFF111B2E);
  static const bgElevated = Color(0xFF162040);
  static const bgCard = Color(0xFF121B31);
  static const border = Color(0xFF24304E);
  static const borderSoft = Color(0xFF1C2744);

  static const textPrimary = Color(0xFFEAF0FC);
  static const textSecondary = Color(0xFF8EA1C9);
  static const textTertiary = Color(0xFF5E6C88);

  static const accentBlue = Color(0xFF59A8FF);
  static const accentPurple = Color(0xFF7C5CFF);
  static const accentCyan = Color(0xFF00D4FF);

  static const success = Color(0xFF23C483);
  static const warning = Color(0xFFFFB347);
  static const danger = Color(0xFFFF6A6A);

  static const accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [accentBlue, accentPurple],
  );
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF111B2E), Color(0xFF162040)],
  );
}

ThemeData buildTheme() {
  const seed = AegisColors.accentBlue;
  const surface = AegisColors.bgBase;
  const cardBg = AegisColors.bgCard;
  const border = AegisColors.border;
  const accentPurple = AegisColors.accentPurple;

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.dark,
      surface: surface,
      primary: seed,
      secondary: accentPurple,
      error: AegisColors.danger,
    ),
    scaffoldBackgroundColor: surface,
    textTheme: ThemeData.dark().textTheme.apply(fontFamily: 'Inter', bodyColor: AegisColors.textPrimary, displayColor: AegisColors.textPrimary),
    cardTheme: CardTheme(
      color: cardBg,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: border),
      ),
      margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 0),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white, fontFamily: 'Inter', letterSpacing: -0.2),
      iconTheme: IconThemeData(color: AegisColors.textPrimary),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: const Color(0xFF0D1628),
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 66,
      indicatorColor: seed.withOpacity(0.18),
      indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 10.5,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          fontFamily: 'Inter',
          color: selected ? seed : AegisColors.textSecondary,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          size: 22,
          color: selected ? seed : AegisColors.textSecondary,
        );
      }),
    ),
    dividerTheme: const DividerThemeData(
      color: AegisColors.borderSoft,
      thickness: 1,
      space: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFF0D1628),
      hintStyle: const TextStyle(color: AegisColors.textTertiary, fontFamily: 'Inter'),
      labelStyle: const TextStyle(color: AegisColors.textSecondary, fontFamily: 'Inter'),
      prefixIconColor: AegisColors.textSecondary,
      suffixIconColor: AegisColors.textSecondary,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: seed, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AegisColors.danger, width: 1.2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: seed,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, fontFamily: 'Inter'),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AegisColors.textPrimary,
        side: const BorderSide(color: border),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, fontFamily: 'Inter'),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: seed,
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, fontFamily: 'Inter'),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: seed,
      foregroundColor: Colors.white,
      elevation: 4,
      highlightElevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(18))),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white.withOpacity(0.06),
      side: const BorderSide(color: border),
      labelStyle: const TextStyle(fontSize: 11, color: Colors.white70, fontFamily: 'Inter', fontWeight: FontWeight.w500),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AegisColors.bgElevated,
      contentTextStyle: const TextStyle(color: AegisColors.textPrimary, fontFamily: 'Inter', fontSize: 13),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      behavior: SnackBarBehavior.floating,
      elevation: 6,
    ),
    dialogTheme: DialogTheme(
      backgroundColor: AegisColors.bgSurface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: border)),
      titleTextStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Colors.white, fontFamily: 'Inter'),
      contentTextStyle: const TextStyle(fontSize: 14, color: AegisColors.textSecondary, fontFamily: 'Inter', height: 1.5),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: seed,
    ),
    listTileTheme: const ListTileThemeData(
      tileColor: Colors.transparent,
      iconColor: AegisColors.textSecondary,
      textColor: AegisColors.textPrimary,
    ),
  );
}

// ═══════════════════════════════════════════════════════════════
// Reusable UI Components
// ═══════════════════════════════════════════════════════════════

/// Gradient container decorator
class GradientBorder extends StatelessWidget {
  final Widget child;
  final Gradient gradient;
  final double borderWidth;
  final double radius;

  const GradientBorder({
    super.key,
    required this.child,
    this.gradient = AegisColors.accentGradient,
    this.borderWidth = 1.5,
    this.radius = 16,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: gradient,
        borderRadius: BorderRadius.circular(radius),
      ),
      padding: EdgeInsets.all(borderWidth),
      child: Container(
        decoration: BoxDecoration(
          color: AegisColors.bgCard,
          borderRadius: BorderRadius.circular(radius - borderWidth),
        ),
        child: child,
      ),
    );
  }
}

/// Pulsing status dot
class PulseDot extends StatefulWidget {
  final Color color;
  final double size;
  const PulseDot({super.key, this.color = AegisColors.success, this.size = 8});

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 1.0, end: 0.4).animate(_ctrl),
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: widget.color.withOpacity(0.5), blurRadius: 6)],
        ),
      ),
    );
  }
}

/// Streaming dots animation
class StreamingDots extends StatefulWidget {
  const StreamingDots({super.key});

  @override
  State<StreamingDots> createState() => _StreamingDotsState();
}

class _StreamingDotsState extends State<StreamingDots> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (i) {
        return AnimatedBuilder(
          animation: _ctrl,
          builder: (_, __) {
            final progress = ((_ctrl.value - i * 0.15) % 1.0 + 1.0) % 1.0;
            final scale = progress < 0.4 ? 0.6 + progress * 1.0 : 1.0 - (progress - 0.4) * 0.6;
            final opacity = progress < 0.4 ? 0.4 + progress * 1.5 : 1.0 - (progress - 0.4) * 1.0;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Transform.scale(
                scale: scale.clamp(0.5, 1.2),
                child: Opacity(
                  opacity: opacity.clamp(0.3, 1.0),
                  child: Container(
                    width: 6, height: 6,
                    decoration: const BoxDecoration(color: AegisColors.accentBlue, shape: BoxShape.circle),
                  ),
                ),
              ),
            );
          },
        );
      }),
    );
  }
}

/// Quick action chip
class QuickActionChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const QuickActionChip({super.key, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          border: Border.all(color: AegisColors.border),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label, style: const TextStyle(fontSize: 12, color: AegisColors.textSecondary, fontFamily: 'Inter')),
      ),
    );
  }
}

/// Gradient brand logo (used in AppBar title)
class BrandLogoMark extends StatelessWidget {
  final double size;
  final IconData? icon;
  const BrandLogoMark({super.key, this.size = 28, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size, height: size,
      decoration: BoxDecoration(
        gradient: AegisColors.accentGradient,
        borderRadius: BorderRadius.circular(size * 0.28),
        boxShadow: [
          BoxShadow(color: AegisColors.accentBlue.withOpacity(0.35), blurRadius: 10, offset: const Offset(0, 2)),
        ],
      ),
      child: Icon(icon ?? Icons.shield_outlined, size: size * 0.58, color: Colors.white),
    );
  }
}

/// Standard branded AppBar title with logo + text
class BrandedTitle extends StatelessWidget {
  final String title;
  final IconData? icon;
  const BrandedTitle(this.title, {super.key, this.icon});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        BrandLogoMark(size: 30, icon: icon),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700, letterSpacing: -0.2),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// Animated background (static grid + soft glow), matches Windows app vibe
class AnimatedAppBackground extends StatelessWidget {
  final Widget child;
  const AnimatedAppBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Base color
        Positioned.fill(child: Container(color: AegisColors.bgBase)),
        // Soft glow top-left
        Positioned(
          top: -80, left: -80,
          child: Container(
            width: 280, height: 280,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [AegisColors.accentBlue.withOpacity(0.10), Colors.transparent]),
            ),
          ),
        ),
        // Soft glow bottom-right
        Positioned(
          bottom: -100, right: -100,
          child: Container(
            width: 320, height: 320,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [AegisColors.accentPurple.withOpacity(0.08), Colors.transparent]),
            ),
          ),
        ),
        child,
      ],
    );
  }
}

/// Themed empty-state widget
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? description;
  final Widget? action;
  const EmptyState({super.key, required this.icon, required this.title, this.description, this.action});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72, height: 72,
              decoration: BoxDecoration(
                color: AegisColors.accentBlue.withOpacity(0.08),
                shape: BoxShape.circle,
                border: Border.all(color: AegisColors.accentBlue.withOpacity(0.2)),
              ),
              child: Icon(icon, size: 32, color: AegisColors.accentBlue),
            ),
            const SizedBox(height: 18),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AegisColors.textPrimary, fontFamily: 'Inter')),
            if (description != null) ...[
              const SizedBox(height: 6),
              Text(description!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12.5, color: AegisColors.textTertiary, fontFamily: 'Inter', height: 1.5)),
            ],
            if (action != null) ...[
              const SizedBox(height: 18),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

/// Themed error widget with retry
class ErrorRetry extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorRetry({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64, height: 64,
              decoration: BoxDecoration(
                color: AegisColors.danger.withOpacity(0.10),
                shape: BoxShape.circle,
                border: Border.all(color: AegisColors.danger.withOpacity(0.25)),
              ),
              child: const Icon(Icons.error_outline_rounded, size: 30, color: AegisColors.danger),
            ),
            const SizedBox(height: 16),
            const Text('Ошибка загрузки',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AegisColors.textPrimary, fontFamily: 'Inter')),
            const SizedBox(height: 6),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12.5, color: AegisColors.textTertiary, fontFamily: 'Inter', height: 1.5)),
            const SizedBox(height: 18),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text('Повторить'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shimmer skeleton card
class SkeletonCard extends StatefulWidget {
  final double height;
  const SkeletonCard({super.key, this.height = 76});

  @override
  State<SkeletonCard> createState() => _SkeletonCardState();
}

class _SkeletonCardState extends State<SkeletonCard> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();
  }
  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }
  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) {
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          height: widget.height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AegisColors.border),
            gradient: LinearGradient(
              begin: Alignment(-1 + _ctrl.value * 2, 0),
              end: Alignment(1 + _ctrl.value * 2, 0),
              colors: const [
                Color(0xFF121B31),
                Color(0xFF1A2748),
                Color(0xFF121B31),
              ],
            ),
          ),
        );
      },
    );
  }
}
