import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores server URL, API key, and optional WS URL in Android's encrypted KeyStore.
class SettingsService {
  SettingsService._();
  static final SettingsService instance = SettingsService._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  String? _baseUrl;
  String? _apiKey;
  String? _wsUrl;

  String? get baseUrl => _baseUrl;
  String? get apiKey => _apiKey;
  String? get wsUrl => _wsUrl;
  bool get hasCredentials => (_baseUrl?.isNotEmpty ?? false) && (_apiKey?.isNotEmpty ?? false);
  bool get hasWsUrl => _wsUrl?.isNotEmpty ?? false;

  Future<void> load() async {
    _baseUrl = await _storage.read(key: 'base_url');
    _apiKey = await _storage.read(key: 'api_key');
    _wsUrl = await _storage.read(key: 'ws_url');
  }

  Future<void> save({required String baseUrl, required String apiKey}) async {
    _baseUrl = baseUrl.trim();
    _apiKey = apiKey.trim();
    await _storage.write(key: 'base_url', value: _baseUrl);
    await _storage.write(key: 'api_key', value: _apiKey);
  }

  Future<void> saveWsUrl(String wsUrl) async {
    _wsUrl = wsUrl.trim();
    await _storage.write(key: 'ws_url', value: _wsUrl);
  }

  Future<void> clear() async {
    _baseUrl = null;
    _apiKey = null;
    _wsUrl = null;
    await _storage.delete(key: 'base_url');
    await _storage.delete(key: 'api_key');
    await _storage.delete(key: 'ws_url');
  }
}
