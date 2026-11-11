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

// 5. Version: every GitHub build gets a higher versionCode so Android installs it as an update.
const code = Number(process.env.APP_VERSION_CODE || 0);
const gradlePath = path.join('android', 'app', 'build.gradle');
if (code > 0 && fs.existsSync(gradlePath)) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/versionCode \d+/, `versionCode ${code}`).replace(/versionName "[^"]*"/, `versionName "1.${code}"`);
  fs.writeFileSync(gradlePath, gradle);
  console.log(`[configure-android] versionCode ${code}`);
}

console.log('[configure-android] portrait lock, full screen and VIBRATE permission applied');
