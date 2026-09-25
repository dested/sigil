import { existsSync, readdirSync } from 'node:fs'
import { cacheDir, listIconSources, listJobs } from '@sigil/core'
import { defineCommand } from 'citty'
import { commonArgs, openProject } from './shared'

export const status = defineCommand({
  meta: { name: 'status', description: 'Project summary: style, icons, references, cache, jobs' },
  args: { ...commonArgs },
  run({ args }) {
    const project = openProject(args.cwd)
    const style = project.style
    if (style === null) return
    const sources = listIconSources(project).map((s) => s.name)
    const sourceSet = new Set(sources)
    const manifestNames = Object.keys(project.manifest)
    const manifestSet = new Set(manifestNames)
    const manifestWithoutSource = manifestNames.filter((n) => !sourceSet.has(n)).sort()
    const sourcesNotInManifest = sources.filter((n) => !manifestSet.has(n))
    const missingRefs = style.references.filter((r) => !sourceSet.has(r))
    const dir = cacheDir(project.sigilDir)
    const cacheEntries = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).length : 0
    const jobs = listJobs(project.sigilDir)
    const running = jobs.filter((j) => j.status === 'running').length
    const tones = Object.keys(style.tones)

    if (args.json) {
      const out = {
        project: project.root,
        iconMd: { ok: true, hash: style.hash, findings: project.styleFindings.length },
        tones,
        roles: style.roles,
        icons: { sources: sources.length, manifest: manifestNames.length, manifestWithoutSource, sourcesNotInManifest },
        references: { names: style.references, missing: missingRefs },
        cache: { entries: cacheEntries },
        jobs: { total: jobs.length, running },
      }
      console.log(JSON.stringify(out, null, 2))
      return
    }
    const styleLine =
      project.styleFindings.length === 0 ? `ok (${style.hash.slice(0, 8)})` : `${project.styleFindings.length} findings`
    console.log(
      [
        `project  ${project.root}`,
        `icon.md  ${styleLine}`,
        `tones    ${tones.join(', ')}`,
        `roles    ${style.roles.join(', ')}`,
        `icons    ${sources.length} sources, ${manifestNames.length} in manifest, ${manifestWithoutSource.length} in manifest without a source, ${sourcesNotInManifest.length} sources not in manifest`,
        `refs     ${style.references.join(', ')} (${missingRefs.length} missing)`,
        `cache    ${cacheEntries} entries`,
        `jobs     ${jobs.length} (${running} running)`,
      ].join('\n'),
    )
  },
})
