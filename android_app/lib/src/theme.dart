import 'package:flutter/material.dart';

/// AegisOps — NEOBRUTALISM design system (paired with public/css/styles.css).
///
/// Principles:
///   • flat fills (no gradients on UI chrome)
///   • chunky 3-px solid borders on everything interactive
///   • hard-offset drop shadows (e.g. `offset: (4,4), blur: 0`)
///   • bold 700–900 Inter, frequent UPPERCASE labels
///   • sharp rectangles (radius ≈ 0)
class AegisColors {
  // ── Canvas ──
  static const bgDeep     = Color(0xFFF5EDD8);
  static const bgBase     = Color(0xFFFFF8EB);
  static const bgSurface  = Color(0xFFFFFFFF);
  static const bgElevated = Color(0xFFFFFFFF);
  static const bgCard     = Color(0xFFFFFFFF);

  // ── Borders (ALWAYS solid) ──
  static const border     = Color(0xFF0B0B0F);
  static const borderSoft = Color(0xFF0B0B0F);
  static const ink        = Color(0xFF0B0B0F);

  // ── Text ──
  static const textPrimary   = Color(0xFF0B0B0F);
  static const textSecondary = Color(0xFF2B2B35);
  static const textTertiary  = Color(0xFF6B6B78);

  // ── Accents (flat, saturated) ──
  static const accentYellow = Color(0xFFFFDE59);
  static const accentRed    = Color(0xFFFF6B6B);
  static const accentGreen  = Color(0xFF4ADE80);
  static const accentBlue   = Color(0xFF3B82F6);
  static const accentPurple = Color(0xFFA855F7);
  static const accentCyan   = Color(0xFF22D3EE);
  static const accentPink   = Color(0xFFEC4899);

  static const success = accentGreen;
  static const warning = Color(0xFFFFB347);
  static const danger  = accentRed;

  // ── Gradients kept as API-compat shims (legacy widgets call them). ──
  // Neobrutalism doesn't use gradients for chrome, but `accentGradient`
  // is still referenced by older screens, so we expose it as a
  // *flat* single-colour LinearGradient.
  static const accentGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [accentYellow, accentYellow],
  );
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [accentYellow, accentYellow],
  );
}

/// Shared shadow used on every "floating" surface.
/// Offset by (4,4) or (5,5), zero blur — the classic brutalist drop.
const List<BoxShadow> kNeoShadow = [
  BoxShadow(color: AegisColors.ink, offset: Offset(4, 4), blurRadius: 0),
];
const List<BoxShadow> kNeoShadowLg = [
  BoxShadow(color: AegisColors.ink, offset: Offset(6, 6), blurRadius: 0),
];
const List<BoxShadow> kNeoShadowSm = [
  BoxShadow(color: AegisColors.ink, offset: Offset(3, 3), blurRadius: 0),
];

/// Public entry point — returns the `ThemeData` for MaterialApp.
ThemeData buildTheme() {
  const seed   = AegisColors.accentYellow;
  const bg     = AegisColors.bgBase;
  const card   = AegisColors.bgCard;
  const border = AegisColors.border;
  const ink    = AegisColors.ink;

  final roundZero = RoundedRectangleBorder(
    borderRadius: BorderRadius.zero,
    side: const BorderSide(color: border, width: 3),
  );

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: const ColorScheme(
      brightness: Brightness.light,
      primary: seed,
      onPrimary: ink,
      secondary: AegisColors.accentPurple,
      onSecondary: AegisColors.bgBase,
      tertiary: AegisColors.accentBlue,
      onTertiary: AegisColors.bgBase,
      error: AegisColors.accentRed,
      onError: ink,
      surface: card,
      onSurface: ink,
      surfaceContainerHighest: AegisColors.bgBase,
      onSurfaceVariant: AegisColors.textSecondary,
      outline: border,
      shadow: ink,
    ),
    scaffoldBackgroundColor: bg,
    textTheme: ThemeData.light().textTheme.apply(
      fontFamily: 'Inter',
      bodyColor: AegisColors.textPrimary,
      displayColor: AegisColors.textPrimary,
    ).copyWith(
      titleLarge:  const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: -0.3, color: ink),
      titleMedium: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w800, fontSize: 16, color: ink),
      labelLarge:  const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: 0.4, color: ink),
    ),
    // Use `CardThemeData` — `CardTheme` is deprecated in Flutter 3.22+.
    cardTheme: CardThemeData(
      color: card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: roundZero,
      margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 0),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AegisColors.accentYellow,
      foregroundColor: ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontSize: 18, fontWeight: FontWeight.w900,
        color: ink, fontFamily: 'Inter', letterSpacing: -0.2,
      ),
      iconTheme: IconThemeData(color: ink),
      shape: Border(bottom: BorderSide(color: ink, width: 4)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AegisColors.bgSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 68,
      indicatorColor: AegisColors.accentYellow,
      indicatorShape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: ink, width: 2.5),
      ),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 10.5,
          fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
          fontFamily: 'Inter',
          color: ink,
          letterSpacing: 0.3,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        return const IconThemeData(size: 22, color: ink);
      }),
    ),
    dividerTheme: const DividerThemeData(
      color: ink,
      thickness: 2,
      space: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AegisColors.bgSurface,
      hintStyle: const TextStyle(color: AegisColors.textTertiary, fontFamily: 'Inter', fontWeight: FontWeight.w600),
      labelStyle: const TextStyle(color: AegisColors.textSecondary, fontFamily: 'Inter', fontWeight: FontWeight.w700),
      prefixIconColor: AegisColors.textPrimary,
      suffixIconColor: AegisColors.textPrimary,
      border: const OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: ink, width: 3),
      ),
      enabledBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: ink, width: 3),
      ),
      focusedBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: AegisColors.accentRed, width: 3),
      ),
      errorBorder: const OutlineInputBorder(
        borderRadius: BorderRadius.zero,
        borderSide: BorderSide(color: AegisColors.accentRed, width: 3),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AegisColors.accentYellow,
        foregroundColor: ink,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        shape: roundZero,
        side: const BorderSide(color: ink, width: 3),
        textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13.5, letterSpacing: 0.4, fontFamily: 'Inter'),
        elevation: 0,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AegisColors.accentYellow,
        foregroundColor: ink,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        shape: roundZero,
        side: const BorderSide(color: ink, width: 3),
        textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13.5, letterSpacing: 0.4, fontFamily: 'Inter'),
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: ink,
        backgroundColor: AegisColors.bgSurface,
        side: const BorderSide(color: ink, width: 3),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
        shape: roundZero,
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: 0.4, fontFamily: 'Inter'),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: ink,
        textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 0.3, fontFamily: 'Inter', decoration: TextDecoration.underline, decorationThickness: 2),
      ),
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: AegisColors.accentYellow,
      foregroundColor: ink,
      elevation: 0,
      highlightElevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: ink, width: 3),
      ),
    ),
    chipTheme: const ChipThemeData(
      backgroundColor: AegisColors.bgSurface,
      side: BorderSide(color: ink, width: 2),
      labelStyle: TextStyle(
        fontSize: 11, color: ink, fontFamily: 'Inter',
        fontWeight: FontWeight.w800, letterSpacing: 0.4,
      ),
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.zero),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: AegisColors.accentYellow,
      contentTextStyle: TextStyle(
        color: ink, fontFamily: 'Inter', fontSize: 13,
        fontWeight: FontWeight.w800,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: ink, width: 3),
      ),
      behavior: SnackBarBehavior.floating,
      elevation: 0,
    ),
    // Use `DialogThemeData` — `DialogTheme` is deprecated in Flutter 3.22+.
    dialogTheme: DialogThemeData(
      backgroundColor: AegisColors.bgSurface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
        side: BorderSide(color: ink, width: 3),
      ),
      titleTextStyle: const TextStyle(
        fontSize: 17, fontWeight: FontWeight.w900,
        color: ink, fontFamily: 'Inter', letterSpacing: 0.3,
      ),
      contentTextStyle: const TextStyle(
        fontSize: 13.5, color: AegisColors.textSecondary,
        fontFamily: 'Inter', height: 1.5, fontWeight: FontWeight.w500,
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AegisColors.accentRed,
      linearTrackColor: AegisColors.bgSurface,
      circularTrackColor: AegisColors.bgSurface,
    ),
    listTileTheme: const ListTileThemeData(
      tileColor: Colors.transparent,
      iconColor: ink,
      textColor: ink,
      titleTextStyle: TextStyle(fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w700, color: ink),
    ),
    scrollbarTheme: ScrollbarThemeData(
      thumbColor: WidgetStatePropertyAll(AegisColors.ink),
      thickness: const WidgetStatePropertyAll(6),
      radius: Radius.zero,
    ),
  );
}

// ═══════════════════════════════════════════════════════════════
// Reusable Neobrutalism Widgets
// ═══════════════════════════════════════════════════════════════

/// A flat container with a solid border and a hard-offset drop shadow.
/// This is the base building block for all neobrutalist surfaces.
class NeoCard extends StatelessWidget {
  final Widget child;
  final Color? color;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double borderWidth;
  final Offset shadowOffset;
  final VoidCallback? onTap;

  const NeoCard({
    super.key,
    required this.child,
    this.color,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.borderWidth = 3,
    this.shadowOffset = const Offset(4, 4),
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? AegisColors.bgSurface,
        border: Border.all(color: AegisColors.ink, width: borderWidth),
        boxShadow: [BoxShadow(color: AegisColors.ink, offset: shadowOffset, blurRadius: 0)],
      ),
      child: child,
    );
    final wrapped = onTap == null
        ? content
        : InkWell(onTap: onTap, splashColor: AegisColors.accentYellow.withOpacity(0.3), child: content);
    return margin == null ? wrapped : Padding(padding: margin!, child: wrapped);
  }
}

/// Brutalist button. Presses down by (2,2), shadow shrinks to (2,2).
class NeoButton extends StatefulWidget {
  final VoidCallback? onPressed;
  final Widget child;
  final Color color;
  final Color? foregroundColor;
  final EdgeInsetsGeometry padding;
  final double minWidth;

  const NeoButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.color = AegisColors.accentYellow,
    this.foregroundColor,
    this.padding = const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
    this.minWidth = 0,
  });

  @override
  State<NeoButton> createState() => _NeoButtonState();
}

class _NeoButtonState extends State<NeoButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final disabled = widget.onPressed == null;
    final fg = widget.foregroundColor ?? AegisColors.ink;
    return GestureDetector(
      onTapDown:   (_) { if (!disabled) setState(() => _down = true); },
      onTapCancel: ()  { if (!disabled) setState(() => _down = false); },
      onTapUp:     (_) { if (!disabled) setState(() => _down = false); },
      onTap: widget.onPressed,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 80),
        curve: Curves.easeOut,
        constraints: BoxConstraints(minWidth: widget.minWidth),
        transform: Matrix4.translationValues(_down ? 2 : 0, _down ? 2 : 0, 0),
        padding: widget.padding,
        decoration: BoxDecoration(
          color: disabled ? AegisColors.bgSurface : widget.color,
          border: Border.all(color: AegisColors.ink, width: 3),
          boxShadow: _down || disabled
              ? const [BoxShadow(color: AegisColors.ink, offset: Offset(1, 1), blurRadius: 0)]
              : const [BoxShadow(color: AegisColors.ink, offset: Offset(4, 4), blurRadius: 0)],
        ),
        child: DefaultTextStyle.merge(
          style: TextStyle(
            fontFamily: 'Inter',
            fontWeight: FontWeight.w900,
            fontSize: 13.5,
            letterSpacing: 0.4,
            color: disabled ? AegisColors.textTertiary : fg,
          ),
          child: IconTheme(
            data: IconThemeData(color: disabled ? AegisColors.textTertiary : fg, size: 18),
            child: Center(widthFactor: widget.minWidth == 0 ? null : 1, child: widget.child),
          ),
        ),
      ),
    );
  }
}

/// Uppercase chunky badge.
class NeoBadge extends StatelessWidget {
  final String text;
  final Color color;
  final Color? foregroundColor;
  final IconData? icon;
  const NeoBadge(this.text, {super.key, this.color = AegisColors.accentYellow, this.foregroundColor, this.icon});

  @override
  Widget build(BuildContext context) {
    final fg = foregroundColor ?? AegisColors.ink;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color,
        border: Border.all(color: AegisColors.ink, width: 2),
        boxShadow: const [BoxShadow(color: AegisColors.ink, offset: Offset(2, 2), blurRadius: 0)],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            text.toUpperCase(),
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

/// Section header with a solid color accent strip.
class NeoSectionHeader extends StatelessWidget {
  final String title;
  final Color accent;
  final Widget? trailing;
  const NeoSectionHeader(this.title, {super.key, this.accent = AegisColors.accentYellow, this.trailing});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(width: 8, height: 24, color: accent),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            title.toUpperCase(),
            style: const TextStyle(
              fontFamily: 'Inter',
              fontSize: 15,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.4,
              color: AegisColors.ink,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Legacy helpers kept for source-compat with existing screens
// ═══════════════════════════════════════════════════════════════

/// Kept for API compatibility — now renders a flat neobrutalist border.
class GradientBorder extends StatelessWidget {
  final Widget child;
  final Gradient gradient;
  final double borderWidth;
  final double radius;

  const GradientBorder({
    super.key,
    required this.child,
    this.gradient = AegisColors.accentGradient,
    this.borderWidth = 3,
    this.radius = 0,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AegisColors.bgSurface,
        border: Border.all(color: AegisColors.ink, width: borderWidth),
        boxShadow: kNeoShadow,
      ),
      child: child,
    );
  }
}

/// Pulsing status dot — kept for existing call-sites, rendered as a
/// solid square with a hard ink border.
class PulseDot extends StatefulWidget {
  final Color color;
  final double size;
  const PulseDot({super.key, this.color = AegisColors.success, this.size = 10});

  @override
  State<PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<PulseDot> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 1.0, end: 0.35).animate(_ctrl),
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          color: widget.color,
          border: Border.all(color: AegisColors.ink, width: 2),
        ),
      ),
    );
  }
}

/// Streaming dots — 3 solid squares bouncing.
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
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat();
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(3, (i) {
        final colors = [AegisColors.accentBlue, AegisColors.accentRed, AegisColors.accentGreen];
        return AnimatedBuilder(
          animation: _ctrl,
          builder: (_, __) {
            final phase = ((_ctrl.value - i * 0.15) % 1.0 + 1.0) % 1.0;
            final lift  = phase < 0.4 ? phase * 16 : (0.4 - (phase - 0.4)) * 16;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Transform.translate(
                offset: Offset(0, -lift.clamp(0.0, 6.0)),
                child: Container(
                  width: 8, height: 8,
                  decoration: BoxDecoration(
                    color: colors[i],
                    border: Border.all(color: AegisColors.ink, width: 1.5),
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

/// Quick-action chip — kept for API compat.
class QuickActionChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const QuickActionChip({super.key, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AegisColors.bgSurface,
          border: Border.all(color: AegisColors.ink, width: 2.5),
          boxShadow: kNeoShadowSm,
        ),
        child: Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 11.5,
            color: AegisColors.ink,
            fontFamily: 'Inter',
            fontWeight: FontWeight.w800,
            letterSpacing: 0.4,
          ),
        ),
      ),
    );
  }
}

/// Brand logo mark — now a chunky square with border + hard shadow.
class BrandLogoMark extends StatelessWidget {
  final double size;
  final IconData? icon;
  const BrandLogoMark({super.key, this.size = 30, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size, height: size,
      decoration: BoxDecoration(
        color: AegisColors.accentYellow,
        border: Border.all(color: AegisColors.ink, width: 2.5),
        boxShadow: const [BoxShadow(color: AegisColors.ink, offset: Offset(2, 2), blurRadius: 0)],
      ),
      child: Icon(icon ?? Icons.bolt_rounded, size: size * 0.62, color: AegisColors.ink),
    );
  }
}

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
            title.toUpperCase(),
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.3,
              color: AegisColors.ink,
            ),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

/// Background: flat canvas + decorative squares instead of soft glows.
class AnimatedAppBackground extends StatelessWidget {
  final Widget child;
  const AnimatedAppBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(child: Container(color: AegisColors.bgBase)),
        // Decorative dot grid (pattern)
        Positioned.fill(
          child: IgnorePointer(
            child: CustomPaint(painter: _DotGridPainter()),
          ),
        ),
        // Corner accents
        Positioned(
          top: -20, right: -20,
          child: Container(
            width: 110, height: 110,
            decoration: BoxDecoration(
              color: AegisColors.accentYellow.withOpacity(0.75),
              border: Border.all(color: AegisColors.ink, width: 3),
            ),
          ),
        ),
        Positioned(
          bottom: -30, left: -30,
          child: Container(
            width: 140, height: 140,
            decoration: BoxDecoration(
              color: AegisColors.accentRed.withOpacity(0.55),
              border: Border.all(color: AegisColors.ink, width: 3),
            ),
          ),
        ),
        child,
      ],
    );
  }
}

class _DotGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = AegisColors.ink.withOpacity(0.08);
    const step = 28.0;
    for (double y = 0; y < size.height; y += step) {
      for (double x = 0; x < size.width; x += step) {
        canvas.drawCircle(Offset(x, y), 1.4, p);
      }
    }
  }
  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Empty-state — now a flat brutalist box.
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
        padding: const EdgeInsets.all(28),
        child: NeoCard(
          color: AegisColors.bgSurface,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  color: AegisColors.accentYellow,
                  border: Border.all(color: AegisColors.ink, width: 3),
                  boxShadow: kNeoShadowSm,
                ),
                child: Icon(icon, size: 34, color: AegisColors.ink),
              ),
              const SizedBox(height: 18),
              Text(
                title.toUpperCase(),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w900,
                  color: AegisColors.ink, fontFamily: 'Inter',
                  letterSpacing: 0.3,
                ),
              ),
              if (description != null) ...[
                const SizedBox(height: 8),
                Text(
                  description!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 12.5, color: AegisColors.textSecondary,
                    fontFamily: 'Inter', height: 1.5, fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              if (action != null) ...[
                const SizedBox(height: 18),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class ErrorRetry extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorRetry({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: NeoCard(
          color: AegisColors.accentRed,
          padding: const EdgeInsets.all(22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 60, height: 60,
                decoration: BoxDecoration(
                  color: AegisColors.bgSurface,
                  border: Border.all(color: AegisColors.ink, width: 3),
                ),
                child: const Icon(Icons.error_outline_rounded, size: 30, color: AegisColors.ink),
              ),
              const SizedBox(height: 16),
              const Text(
                'ОШИБКА ЗАГРУЗКИ',
                style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w900,
                  color: AegisColors.ink, fontFamily: 'Inter',
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12.5, color: AegisColors.ink,
                  fontFamily: 'Inter', height: 1.5, fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 18),
              NeoButton(
                onPressed: onRetry,
                color: AegisColors.bgSurface,
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.refresh_rounded, size: 18),
                    SizedBox(width: 8),
                    Text('ПОВТОРИТЬ'),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Skeleton loader — now a brutalist striped block.
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
          margin: const EdgeInsets.only(bottom: 10),
          height: widget.height,
          decoration: BoxDecoration(
            border: Border.all(color: AegisColors.ink, width: 2.5),
            boxShadow: kNeoShadowSm,
            gradient: LinearGradient(
              begin: Alignment(-1 + _ctrl.value * 2, 0),
              end: Alignment(1 + _ctrl.value * 2, 0),
              tileMode: TileMode.repeated,
              colors: const [
                Color(0xFFFFF8EB),
                Color(0xFFFFDE59),
                Color(0xFFFFF8EB),
              ],
            ),
          ),
        );
      },
    );
  }
}
