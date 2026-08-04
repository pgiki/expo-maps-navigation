export type Language =
  | 'ar'
  | 'bg'
  | 'ca'
  | 'da'
  | 'de'
  | 'el'
  | 'en'
  | 'es-ES'
  | 'es'
  | 'fa'
  | 'fr'
  | 'he'
  | 'hu'
  | 'it'
  | 'ja'
  | 'ko'
  | 'lt'
  | 'nl'
  | 'pl'
  | 'pt-BR'
  | 'pt-PT'
  | 'ru'
  | 'sl'
  | 'sv'
  | 'tr'
  | 'uk'
  | 'vi'
  | 'yo'
  | 'zh-Hans'
  | 'zh-Hant';

/** BCP-47 locale tag for `expo-speech`. */
export function speechLocale(language: Language): string {
  switch (language) {
    case 'zh-Hans':
      return 'zh-CN';
    case 'zh-Hant':
      return 'zh-TW';
    default:
      return language;
  }
}
