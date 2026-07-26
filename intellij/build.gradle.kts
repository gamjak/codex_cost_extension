import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  kotlin("jvm") version "2.2.20"
  id("org.jetbrains.intellij.platform") version "2.10.2"
}

group = "com.gamjak"
version = "0.5.0"

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
