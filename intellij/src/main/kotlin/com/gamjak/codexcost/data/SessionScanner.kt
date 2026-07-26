package com.gamjak.codexcost.data

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.isDirectory

data class SessionFileDescriptor(
  val path: Path,
  val size: Long,
  val lastModifiedMillis: Long
)

fun findSessionFileDescriptors(roots: List<Path>): List<SessionFileDescriptor> =
  roots.asSequence()
    .map { it.toAbsolutePath().normalize() }
    .distinct()
    .flatMap { root ->
      if (!root.isDirectory()) emptySequence()
      else Files.walk(root).use { paths ->
        paths.filter { path -> Files.isRegularFile(path) && path.fileName.toString().endsWith(".jsonl", true) }
          .map { path ->
            val attributes = Files.readAttributes(path, java.nio.file.attribute.BasicFileAttributes::class.java)
            SessionFileDescriptor(path.toAbsolutePath().normalize(), attributes.size(), attributes.lastModifiedTime().toMillis())
          }.toList().asSequence()
      }
    }
    .distinctBy { it.path }
    .sortedBy { it.path.toString() }
    .toList()
