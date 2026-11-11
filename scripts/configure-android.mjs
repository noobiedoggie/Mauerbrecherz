// Runs automatically after `npx cap sync` (package.json "capacitor:sync:after").
// Makes the generated Android project portrait-only, full screen, and allows vibration.
// Safe to run many times.
import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifestPath)) {
  console.log('[configure-android] no android/ project yet, skipping');
  process.exit(0);
}

let xml = fs.readFileSync(manifestPath, 'utf8');

// 1. Portrait only.
if (!xml.includes('android:screenOrientation')) {
  xml = xml.replace(/<activity(\s)/, '<activity android:screenOrientation="portrait"$1');
}

// 2. Keep the screen awake while playing is handled by the game loop; the activity
//    also needs to resize nothing when the (hidden) system bars appear.
if (!xml.includes('android:resizeableActivity')) {
  xml = xml.replace(/<activity(\s)/, '<activity android:resizeableActivity="false"$1');
}

// 3. Vibration permission for @capacitor/haptics.
if (!xml.includes('android.permission.VIBRATE')) {
  xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>');
}

fs.writeFileSync(manifestPath, xml);

// 4. Full screen theme: no action bar, content drawn behind the system bars.
const stylesPath = path.join('android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, 'utf8');
  if (!styles.includes('android:windowFullscreen')) {
    styles = styles.replace(
      /(<style name="AppTheme.NoActionBar"[^>]*>)/,
      '$1\n        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>',
    );
    fs.writeFileSync(stylesPath, styles);
  }
}

// 5. Sign debug builds with the shared key in android-keys/ (same signature on
//    every machine, so a new APK installs over the old one as an update).
const appGradle = path.join('android', 'app', 'build.gradle');
const keystore = path.join('android-keys', 'debug.keystore');
if (fs.existsSync(appGradle) && fs.existsSync(keystore)) {
  let gradle = fs.readFileSync(appGradle, 'utf8');
  if (!gradle.includes('android-keys/debug.keystore')) {
    gradle = gradle.replace(
      /android\s*\{/,
      `android {
    signingConfigs {
        debug {
            storeFile file("\${rootDir}/../android-keys/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }`,
    );
    fs.writeFileSync(appGradle, gradle);
    console.log('[configure-android] debug builds signed with android-keys/debug.keystore');
  }
}

// 6. App icon and splash screen: copy resources/android/res over the defaults
//    (made by resources/render.cjs from resources/icon.svg).
const resSrc = path.join('resources', 'android', 'res');
const resDst = path.join('android', 'app', 'src', 'main', 'res');
if (fs.existsSync(resSrc) && fs.existsSync(resDst)) {
  fs.cpSync(resSrc, resDst, { recursive: true });
  const bgPath = path.join(resDst, 'values', 'ic_launcher_background.xml');
  fs.writeFileSync(
    bgPath,
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFC234</color>\n</resources>\n',
  );
  console.log('[configure-android] Berlirunner icon and splash applied');
}

// 7. Version: every GitHub build gets a higher versionCode so Android installs it as an update.
const code = Number(process.env.APP_VERSION_CODE || 0);
const gradlePath = path.join('android', 'app', 'build.gradle');
if (code > 0 && fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "1.${code}"`);
  fs.writeFileSync(gradlePath, gradle);
  console.log(`[configure-android] versionCode ${code}`);
}

console.log('[configure-android] portrait lock, full screen and VIBRATE permission applied');
