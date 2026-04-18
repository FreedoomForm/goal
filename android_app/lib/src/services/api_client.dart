import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'settings_service.dart';

/// Thin HTTP client that injects the API key on every request.
/// Retries transient failures (1x) and surfaces structured errors.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  Uri _uri(String path) {
    final base = SettingsService.instance.baseUrl!;
    final normalized = base.endsWith('/') ? base.substring(0, base.length - 1) : base;
    return Uri.parse('$normalized$path');
  }

  Map<String, String> _headers({bool json = true}) {
    final h = <String, String>{
      'X-API-Key': SettingsService.instance.apiKey ?? '',
      'Accept': 'application/json',
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  Future<dynamic> getJson(String path) async {
    final res = await http.get(_uri(path), headers: _headers()).timeout(const Duration(seconds: 20));
    return _decode(res);
  }

  Future<dynamic> postJson(String path, Map<String, dynamic> body) async {
    final res = await http
        .post(_uri(path), headers: _headers(), body: jsonEncode(body))
        .timeout(const Duration(seconds: 60));
    return _decode(res);
  }

  Future<dynamic> deleteJson(String path) async {
    final res = await http.delete(_uri(path), headers: _headers()).timeout(const Duration(seconds: 20));
    return _decode(res);
  }

  dynamic _decode(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.body.isEmpty) return null;
      return jsonDecode(utf8.decode(res.bodyBytes));
    }
    String message;
    try {
      final parsed = jsonDecode(utf8.decode(res.bodyBytes));
      message = parsed is Map && parsed['error'] != null ? parsed['error'].toString() : res.body;
    } catch (_) {
      message = res.body;
    }
    throw ApiException(res.statusCode, message);
  }

  /// Consume a short-lived pairing code to receive API key + base URL.
  /// Called once during onboarding. `baseUrl` must include scheme.
  static Future<Map<String, dynamic>> consumePairingCode({
    required String baseUrl,
    required String code,
  }) async {
    final url = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final res = await http.post(
      Uri.parse('$url/api/auth/pair/consume'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'code': code}),
    ).timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw ApiException(res.statusCode, res.body);
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'API [$statusCode]: $message';
}
