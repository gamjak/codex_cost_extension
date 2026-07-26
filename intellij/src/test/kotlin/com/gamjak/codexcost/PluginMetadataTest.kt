package com.gamjak.codexcost

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PluginMetadataTest {
  @Test
  fun `plugin declares both IDEA editions through platform module only`() {
    val xml = javaClass.getResource("/META-INF/plugin.xml")!!.readText()

    assertTrue(xml.contains("<id>com.gamjak.codexcost</id>"))
    assertTrue(xml.contains("<depends>com.intellij.modules.platform</depends>"))
    assertFalse(xml.contains("com.intellij.modules.java"))
  }
}
