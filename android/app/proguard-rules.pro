# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---- WorkBench (R8 on since versionCode 6, 2026-10-27) ----
# Readable crash traces on Play (the mapping file rides inside the AAB).
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile
# Capacitor reaches plugins and their @PluginMethod / @PermissionCallback
# methods by reflection; its own consumer rules cover node_modules plugins,
# these cover the ones that live in this project.
-keep class com.streamflaire.hub.** { *; }
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
# Square Mobile Payments SDK (Tap to Pay) + the debug-only mock reader the
# plugin opens by reflection.
-keep class com.squareup.sdk.mobilepayments.** { *; }
-dontwarn com.squareup.sdk.mobilepayments.mockreader.**
-dontwarn com.squareup.**
# Google sign-in / Firebase messaging / Play services carry their own rules;
# silence the optional bits they reference but we do not ship.
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**
-dontwarn kotlinx.**
# Classes referenced by the Square SDK / sqlite-jdbc that Android never ships
# (R8 missing_rules.txt, 2026-10-27).
-dontwarn java.sql.JDBCType
-dontwarn org.slf4j.Logger
-dontwarn org.slf4j.LoggerFactory

# Telnyx Android WebRTC SDK (the calling engine): Gson maps its verto
# messages onto Kotlin data classes by field name, and the WebRTC library is
# JNI-backed — keep both whole.
-keep class com.telnyx.webrtc.** { *; }
-keep class org.webrtc.** { *; }
-keepclassmembers class * { @com.google.gson.annotations.SerializedName <fields>; }
-dontwarn com.telnyx.webrtc.**
-dontwarn org.webrtc.**
