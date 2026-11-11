# Debug signing key

`debug.keystore` is a standard Android **debug** key (store and key password: `android`,
alias: `androiddebugkey`). It is committed on purpose so that every APK built on GitHub
(and locally) is signed with the same key. That lets a new APK install over the old one
as an update, keeping the save data.

It is only for debug builds. Do not use it to publish on Google Play.

`scripts/configure-android.mjs` (run by `npx cap sync`) adds it to `android/app/build.gradle`,
so local and GitHub builds both use it automatically.
