plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val surumKodu = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()

android {
    namespace = "com.gunteknik.kumanda"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.gunteknik.kumanda"
        minSdk = 26
        targetSdk = 35
        versionCode = surumKodu
        versionName = "1.0.$surumKodu"
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }
        externalNativeBuild {
            cmake {
                cppFlags += listOf("-std=gnu++11")
            }
        }
    }

    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("imza/gunkumanda.keystore")
            storePassword = "gunkumanda"
            keyAlias = "gunkumanda"
            keyPassword = "gunkumanda"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    packaging {
        resources.excludes += listOf("META-INF/*.kotlin_module")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
}
