# Background location (opt-in)

Foreground GPS is the default. Background tracking is **opt-in** via `enableBackgroundLocation` on `ExpoMapsNavigation`.

## Host setup

### iOS

Add background location mode in `app.json` / config plugin:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["location"],
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Navigation continues while the app is in the background.",
        "NSLocationWhenInUseUsageDescription": "Navigation needs your location."
      }
    }
  }
}
```

### Android

Use a foreground service / background location permissions per [expo-location docs](https://docs.expo.dev/versions/latest/sdk/location/). Example:

```json
{
  "expo": {
    "android": {
      "permissions": [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION"
      ]
    },
    "plugins": [
      [
        "expo-location",
        {
          "isAndroidBackgroundLocationEnabled": true,
          "isAndroidForegroundServiceEnabled": true
        }
      ]
    ]
  }
}
```

## Library behavior

When `enableBackgroundLocation` is true:

1. Requests background permission after foreground grant
2. Uses `Location.Accuracy.BestForNavigation` with continuous updates
3. Does **not** start an Android foreground service by itself — host config above is required for reliable background delivery

Simulation (`shouldSimulateRoute`) ignores this prop.
