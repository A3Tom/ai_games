import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

import { checkBuild, collectBuilds, discoverBuilds, fingerprintFromImage, inputLabel,
  recordBuild, resolveConfig } from './game-images.mjs'

const directories = []
const digest = `sha256:${'a'.repeat(64)}`
const key = 'b'.repeat(64)
const sha = 'c'.repeat(40)
const build = { id: 'example', source: 'games/example', dockerfile: 'games/example/Dockerfile',
  image: 'ghcr.io/owner/repository-example', key, tag: `ghcr.io/owner/repository-example:source-${key}`, buildArgs: '' }
const reference = `${build.image}@${digest}`

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'ai-games-images-'))
  directories.push(directory)
  return directory
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
}

function commit(root) {
  git(root, ['add', '--all'])
  git(root, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'Fixture update'])
}

async function put(root, name, value) {
  await mkdir(path.dirname(path.join(root, name)), { recursive: true })
  await writeFile(path.join(root, name), value)
}

async function fixture() {
  const root = await temporaryDirectory()
  git(root, ['init', '--quiet'])
  for (const name of ['games/example/Dockerfile', 'games/example/main.js', 'games/other/Dockerfile',
    'games/plain/index.html', 'shared/game-shell.js', 'packages/client/index.js', '.dockerignore',
    '.github/workflows/game-images.yml', 'scripts/game-images.mjs', 'extra/toolchain.txt']) {
    await put(root, name, `Initial ${name}\n`)
  }
  commit(root)
  return root
}

async function discover(root, variables = {}) {
  return discoverBuilds({ root, repository: 'Owner/Repository', variables })
}

test('discovers Dockerfiles independently of the registry and uses lowercase image names', async () => {
  const root = await fixture()
  const matrix = await discover(root)
  assert.deepEqual(matrix.include.map((entry) => entry.id), ['example', 'other'])
  assert.equal(matrix.include[0].image, 'ghcr.io/owner/repository-example')
  assert.equal(matrix.include[0].source, 'games/example')
  assert.equal(matrix.include[0].dockerfile, 'games/example/Dockerfile')
  assert.equal(matrix.include[0].tag, `${matrix.include[0].image}:source-${matrix.include[0].key}`)
  assert.equal(matrix.include[0].buildArgs, '')
  assert.deepEqual(await discoverBuilds({ root: await temporaryDirectory(), repository: 'owner/repo' }), { include: [] })
})

test('fingerprints game additions, edits and deletions but ignores unrelated commits', async () => {
  const root = await fixture()
  let previous = (await discover(root)).include[0].key
  for (const [name, value] of [['games/other/main.js', 'Other game'], ['README.md', 'Documentation']]) {
    await put(root, name, value)
    commit(root)
    assert.equal((await discover(root)).include[0].key, previous)
  }
  for (const change of [
    () => put(root, 'games/example/new.js', 'Added file'),
    () => put(root, 'games/example/main.js', 'Edited file'),
    () => rm(path.join(root, 'games/example/new.js')),
    () => put(root, 'shared/game-shell.js', 'Changed shared shell'),
    () => put(root, 'packages/client/index.js', 'Changed shared package'),
    () => put(root, '.dockerignore', '**/generated'),
    () => put(root, '.github/workflows/game-images.yml', 'Changed build settings'),
    () => put(root, 'scripts/game-images.mjs', 'Changed fingerprint implementation'),
  ]) {
    await change()
    commit(root)
    const current = (await discover(root)).include[0].key
    assert.notEqual(current, previous)
    previous = current
  }
})

test('fingerprints declared external inputs and resolved build arguments', async () => {
  const root = await fixture()
  await put(root, 'games/example/image-build.json', JSON.stringify({ inputs: ['extra/toolchain.txt'],
    buildArgs: { SKIP_DATA: { variable: 'SKIP', default: '0' }, STATIC_OPTION: 'value' } }))
  commit(root)
  const initial = (await discover(root)).include[0]
  assert.equal(initial.buildArgs, 'SKIP_DATA=0\nSTATIC_OPTION=value')
  assert.equal((await discover(root, { SKIP: '0', UNUSED: 'anything' })).include[0].key, initial.key)
  assert.notEqual((await discover(root, { SKIP: '1' })).include[0].key, initial.key)
  await put(root, 'extra/toolchain.txt', 'New toolchain')
  commit(root)
  assert.notEqual((await discover(root)).include[0].key, initial.key)
  const changed = (await discover(root)).include[0].key
  await rm(path.join(root, 'extra/toolchain.txt'))
  commit(root)
  assert.notEqual((await discover(root)).include[0].key, changed)
})

test('rejects unsafe configuration and ignores symlink Dockerfiles', async () => {
  for (const inputs of [['../secret'], ['/absolute'], ['games/../secret'], ['--all'], ['a//b'], ['*.json']]) {
    assert.throws(() => resolveConfig({ inputs }), /Invalid build input/)
  }
  for (const buildArgs of [{ ARG: 'a\nb' }, { ARG: 'a\rb' }, { 'BAD=ARG': 'x' },
    { ARG: { variable: 'VALUE', default: '\n' } }, { ARG: { variable: 'BAD\nVALUE' } }, { ARG: 1 }]) {
    assert.throws(() => resolveConfig({ buildArgs }))
  }
  assert.throws(() => resolveConfig({ buildArgs: { ARG: { variable: 'VALUE' } } }, { VALUE: 'a\nb' }))
  assert.throws(() => resolveConfig({ unknownOption: true }))
  assert.throws(() => resolveConfig({ inputs: 'shared' }))
  assert.throws(() => resolveConfig({ buildArgs: [] }))
  const root = await fixture()
  await mkdir(path.join(root, 'games/symlink'))
  await symlink(path.join(root, 'games/example/Dockerfile'), path.join(root, 'games/symlink/Dockerfile'))
  assert.equal((await discover(root)).include.length, 2)
  await assert.rejects(discoverBuilds({ root, repository: 'owner/repository:latest' }), /Invalid GITHUB_REPOSITORY/)
})

test('treats prototype-shaped argument and variable names as ordinary own properties', () => {
  const config = JSON.parse('{"buildArgs":{"__proto__":"literal","VALUE":{"variable":"constructor","default":"fallback"}}}')
  const resolved = resolveConfig(config)
  assert.equal(Object.hasOwn(resolved.args, '__proto__'), true)
  assert.equal(resolved.args.__proto__, 'literal')
  assert.equal(resolved.args.VALUE, 'fallback')
})

function inspection(fingerprint = key, image = { config: { Labels: { [inputLabel]: fingerprint } } }) {
  return { status: 0, stdout: JSON.stringify({ manifest: { digest }, image }), stderr: '' }
}

function absent(stderr = 'ERROR: manifest unknown') {
  return { status: 1, stdout: '', stderr }
}

test('reads fingerprints from direct and platform-keyed registry configurations', () => {
  assert.equal(fingerprintFromImage({ config: { Labels: { [inputLabel]: key } } }), key)
  assert.equal(fingerprintFromImage({ 'linux/amd64': { config: { Labels: { [inputLabel]: key } } },
    'linux/arm64': { config: { Labels: { [inputLabel]: 'different' } } } }), key)
  assert.equal(fingerprintFromImage({ config: {} }), undefined)
  assert.equal(fingerprintFromImage(null), undefined)
})

test('reuses matching latest by immutable digest without checking a source tag', () => {
  const references = []
  assert.deepEqual(checkBuild(build, { runner(command, args) {
    assert.equal(command, 'docker')
    references.push(args[3])
    return inspection()
  } }), { build: false, image: reference })
  assert.deepEqual(references, [`${build.image}:latest`])
})

test('reuses a matching source tag when latest differs or has no fingerprint', () => {
  for (const latest of [inspection('old'), inspection(undefined, { config: {} })]) {
    const references = []
    assert.deepEqual(checkBuild(build, { runner(command, args) {
      references.push(args[3])
      return references.length === 1 ? latest : inspection(key, { 'linux/amd64': { config: { Labels: { [inputLabel]: key } } } })
    } }), { build: false, image: reference })
    assert.deepEqual(references, [`${build.image}:latest`, build.tag])
  }
})

test('builds missing or changed versions and supports explicit forced refreshes', () => {
  for (const response of [absent(), absent('ERROR: unauthorized'), absent('unexpected status: 403 Forbidden'), inspection('old')]) {
    let calls = 0
    const warnings = []
    assert.deepEqual(checkBuild(build, { runner() { calls++; return response }, warn: (message) => warnings.push(message) }), { build: true })
    assert.equal(calls, 2)
    if (response.status !== 0) assert.equal(warnings.length, 2)
  }
  assert.deepEqual(checkBuild(build, { force: true, runner() { throw new Error('Should not inspect') } }), { build: true })
})

test('fails visibly for network errors and malformed registry responses', () => {
  assert.throws(() => checkBuild(build, { runner: () => absent('dial tcp: timeout') }), /Cannot inspect.*timeout/)
  assert.throws(() => checkBuild(build, { runner: () => ({ status: 0, stdout: '{}' }) }), /Invalid registry response/)
  assert.throws(() => checkBuild(build, { runner: () => ({ status: 0, stdout: 'not JSON' }) }), SyntaxError)
  assert.throws(() => checkBuild(build, { runner: () => ({ status: 0,
    stdout: JSON.stringify({ image: { config: { Labels: { [inputLabel]: key } } }, manifest: { digest: 'bad' } }) }) }), /Invalid image digest/)
})

test('records build digests and promotes latest only for the current default-branch HEAD', async () => {
  const resultsDirectory = await temporaryDirectory()
  const commands = []
  await recordBuild(build, { resultsDirectory, builtDigest: digest, defaultBranch: 'main', ref: 'refs/heads/main', sha,
    runner(command, args) { commands.push([command, ...args]); return { status: 0, stdout: `${sha}\trefs/heads/main\n` } } })
  assert.deepEqual(commands, [
    ['git', 'ls-remote', 'origin', 'refs/heads/main'],
    ['docker', 'buildx', 'imagetools', 'create', '--prefer-index=false', '--tag', `${build.image}:latest`, reference],
  ])
  assert.deepEqual(JSON.parse(await readFile(path.join(resultsDirectory, 'example.json'), 'utf8')), { id: build.id, image: reference })
  const staleCommands = []
  await recordBuild(build, { resultsDirectory, resolvedImage: reference, defaultBranch: 'main', ref: 'refs/heads/main', sha,
    runner(command, args) { staleCommands.push(command); return { status: 0, stdout: `${'d'.repeat(40)}\trefs/heads/main\n` } } })
  assert.deepEqual(staleCommands, ['git'])
  await recordBuild(build, { resultsDirectory, resolvedImage: reference, defaultBranch: 'main', ref: 'refs/tags/v1', sha,
    runner() { throw new Error('Tagged releases must not promote latest') } })
  await recordBuild(build, { resultsDirectory, resolvedImage: reference, defaultBranch: 'main', ref: 'refs/heads/feature', sha,
    runner() { throw new Error('Feature branches must not promote latest') } })
  await assert.rejects(recordBuild(build, { resultsDirectory, resolvedImage: `${build.image}:latest` }), /Invalid/)
})

test('collects exactly the expected digest references and handles an empty matrix', async () => {
  const resultsDirectory = await temporaryDirectory()
  const other = { ...build, id: 'other', source: 'games/other', dockerfile: 'games/other/Dockerfile', image: 'ghcr.io/owner/repository-other',
    tag: `ghcr.io/owner/repository-other:source-${key}` }
  await recordBuild(build, { resultsDirectory, resolvedImage: reference })
  await assert.rejects(collectBuilds({ include: [build, other] }, resultsDirectory), /do not match/)
  await recordBuild(other, { resultsDirectory, builtDigest: digest })
  assert.deepEqual(await collectBuilds({ include: [build, other] }, resultsDirectory),
    { example: reference, other: `${other.image}@${digest}` })
  await assert.rejects(collectBuilds({ include: [build] }, resultsDirectory), /do not match/)
  await assert.rejects(collectBuilds({ include: [build, build] }, resultsDirectory), /Duplicate/)
  await writeFile(path.join(resultsDirectory, 'other.json'), JSON.stringify({ id: 'other', image: `${build.image}@${digest}` }))
  await assert.rejects(collectBuilds({ include: [build, other] }, resultsDirectory), /Invalid resolved/)
  assert.deepEqual(await collectBuilds({ include: [] }, path.join(resultsDirectory, 'absent')), {})
})
