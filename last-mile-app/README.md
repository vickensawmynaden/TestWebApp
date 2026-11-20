# Last Mile — native app shell

Capacitor wrapper that ships the Last Mile zombie runner (`../manor-game/run.html`) as an
Android and iOS app (landscape, full screen, screen kept awake, vibration).

## Android (no setup needed)

Every push that touches the game builds a debug APK in GitHub Actions
(`.github/workflows/last-mile-android.yml`). Download `last-mile.apk` from the
**last-mile-latest** pre-release (or the run's artifacts) on your phone and install it.

Local build (needs Android Studio / SDK + JDK 21):

```
npm install
npm run android:apk        # -> android/app/build/outputs/apk/debug/app-debug.apk
```

## iOS

Needs a Mac with Xcode and an Apple developer account:

```
npm install
npm run sync:ios
npx cap open ios           # then pick your team, plug in the iPhone, press Run
```

Without a Mac, open the hosted `run.html` in Safari and use Share → Add to Home Screen;
it installs as a full-screen web app with an offline cache.
