import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.dsl.JvmDefaultMode

plugins {
  kotlin("jvm") version "2.2.20"
  id("org.jetbrains.intellij.platform") version "2.18.1"
}

group = "com.gamjak"
version = "0.6.0"

repositories {
  mavenCentral()
  intellijPlatform {
    defaultRepositories()
  }
}

dependencies {
  implementation("com.google.code.gson:gson:2.13.2")
  testImplementation(kotlin("test"))
  intellijPlatform {
    intellijIdeaCommunity("2024.2")
  }
}

kotlin {
  compilerOptions {
    jvmTarget.set(JvmTarget.JVM_21)
    jvmDefault.set(JvmDefaultMode.NO_COMPATIBILITY)
  }
}

intellijPlatform {
  pluginConfiguration {
    ideaVersion {
      sinceBuild = "242"
    }
  }
  pluginVerification {
    ides {
      recommended()
    }
  }
}

tasks {
  test {
    useJUnitPlatform()
  }
}
