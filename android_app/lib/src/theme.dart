import 'package:flutter/material.dart';

ThemeData buildTheme() {
  const seed = Color(0xFF59A8FF);
  const surface = Color(0xFF0B1220);
  const cardBg = Color(0xFF121B31);
  const border = Color(0xFF24304E);
  const accentPurple = Color(0xFF7C5CFF);
  const success = Color(0xFF23C483);
  const danger = Color(0xFFFF6A6A);
  const warning = Color(0xFFFFB347);
  const cyan = Color(0xFF00D4FF);

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.dark,
      surface: surface,
      primary: seed,
      secondary: accentPurple,
    ),
    scaffoldBackgroundColor: surface,
    textTheme: ThemeData.dark().textTheme.apply(fontFamily: 'Inter'),
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
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: const Color(0xFF0F1830),
      indicatorColor: seed.withOpacity(0.15),
      labelTextStyle: const WidgetStatePropertyAll(TextStyle(fontSize: 11, fontWeight: FontWeight.w500, fontFamily: 'Inter')),
      iconTheme: WidgetStatePropertyAll(const IconThemeData(size: 22)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: surface,
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
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: seed,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, fontFamily: 'Inter'),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: Colors.white.withOpacity(0.06),
      side: const BorderSide(color: border),
      labelStyle: const TextStyle(fontSize: 11, color: Colors.white70, fontFamily: 'Inter'),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
  );
}

// Gradient container decorator
class GradientBorder extends StatelessWidget {
  final Widget child;
  final Gradient gradient;
  final double borderWidth;
  final double radius;

  const GradientBorder({
    super.key,
    required this.child,
    this.gradient = const LinearGradient(colors: [Color(0xFF59A8FF), Color(0xFF7C5CFF)]),
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
          color: const Color(0xFF121B31),
          borderRadius: BorderRadius.circular(radius - borderWidth),
        ),
        child: child,
      ),
    );
  }
}

// Pulsing status dot
class PulseDot extends StatefulWidget {
  final Color color;
  final double size;
  const PulseDot({super.key, this.color = const Color(0xFF23C483), this.size = 8});

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

// Streaming dots animation
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
            final progress = (_ctrl.value - i * 0.15) % 1.0;
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
                    decoration: const BoxDecoration(color: Color(0xFF59A8FF), shape: BoxShape.circle),
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

// Quick action chip
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
          border: Border.all(color: const Color(0xFF24304E)),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF8EA1C9), fontFamily: 'Inter')),
      ),
    );
  }
}
