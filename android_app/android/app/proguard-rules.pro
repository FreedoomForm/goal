# Flutter-specific rules
-keep class io.flutter.** { *; }
-keep class androidx.lifecycle.DefaultLifecycleObserver
# mobile_scanner (barcode_scanning)
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.mlkit.**
