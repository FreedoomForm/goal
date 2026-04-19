import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores server URL and API key in Android's encrypted KeyStore.
class SettingsService {
  SettingsService._();
  static final SettingsService instance = SettingsService._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  String? _baseUrl;
  String? _apiKey;

  String? get baseUrl => _baseUrl;
  String? get apiKey => _apiKey;
  bool get hasCredentials => (_baseUrl?.isNotEmpty ?? false) && (_apiKey?.isNotEmpty ?? false);

  Future<void> load() async {
    _baseUrl = await _storage.read(key: 'base_url');
    _apiKey = await _storage.read(key: 'api_key');
  }

  Future<void> save({required String baseUrl, required String apiKey}) async {
    _baseUrl = baseUrl.trim();
    _apiKey = apiKey.trim();
    await _storage.write(key: 'base_url', value: _baseUrl);
    await _storage.write(key: 'api_key', value: _apiKey);
  }

  Future<void> clear() async {
    _baseUrl = null;
    _apiKey = null;
    await _storage.delete(key: 'base_url');
    await _storage.delete(key: 'api_key');
  }
}
