import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { appendFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const inputLabel = 'io.ai-games.build-inputs'
const platform = 'linux/amd64'
const identifier = /^[a-z0-9][a-z0-9_-]{0,63}$/
const digestPattern = /^sha256:[0-9a-f]{64}$/
const repositoryPattern = /^[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_.-]*$/
const rootDirectory = fileURLToPath(new URL('../', import.meta.url))

function run(command, args, options) {
  return spawnSync(command, args, { ...options, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
}

function checkedRun(runner, root, command, args) {
  const result = runner(command, args, { cwd: root })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.signal || result.status}`)
  }
  return result.stdout
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function singleLine(value, description) {
  if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error(`Invalid ${description}`)
  return value
}

function inputPath(value) {
  if (typeof value !== 'string' || !value.split('/').every((part) =>
    /^[a-zA-Z0-9_.-]+$/.test(part) && part !== '.' && part !== '..' && !part.startsWith('-'))) {
    throw new Error(`Invalid build input path: ${value}`)
  }
  return value
}

export function resolveConfig(config = {}, variables = {}) {
  if (!object(config) || Object.keys(config).some((key) => !['inputs', 'buildArgs'].includes(key)) ||
      !object(variables) || (config.inputs !== undefined && !Array.isArray(config.inputs)) ||
      (config.buildArgs !== undefined && !object(config.buildArgs))) {
    throw new Error('Invalid image-build.json configuration')
  }
  const inputs = [...new Set((config.inputs ?? []).map(inputPath))].sort()
  const args = []
  for (const name of Object.keys(config.buildArgs ?? {}).sort()) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Invalid build argument: ${name}`)
    const setting = config.buildArgs[name]
    let value = setting
    if (object(setting)) {
      if (Object.keys(setting).some((key) => !['variable', 'default'].includes(key)) ||
          !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(setting.variable ?? '')) {
        throw new Error(`Invalid variable setting for ${name}`)
      }
      const fallback = singleLine(setting.default ?? '', `default for ${name}`)
      value = (Object.hasOwn(variables, setting.variable) ? variables[setting.variable] : '') || fallback
    }
    args.push([name, singleLine(value, `value for build argument ${name}`)])
  }
  return { inputs, args: Object.fromEntries(args) }
}

export async function discoverBuilds({ root = rootDirectory, repository, variables = {}, runner = run } = {}) {
  const normalizedRepository = repository?.toLowerCase()
  if (!repositoryPattern.test(normalizedRepository ?? '')) throw new Error('Invalid GITHUB_REPOSITORY')
  const builds = []
  let entries
  try {
    entries = await readdir(path.join(root, 'games'), { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return { include: builds }
    throw error
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    const source = `games/${entry.name}`
    const dockerfile = `${source}/Dockerfile`
    try {
      if (!(await lstat(path.join(root, dockerfile))).isFile()) continue
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (!identifier.test(entry.name)) throw new Error(`Invalid game image directory: ${entry.name}`)
    let config = {}
    const configPath = path.join(root, source, 'image-build.json')
    try {
      if (!(await lstat(configPath)).isFile()) throw new Error(`Build configuration must be a regular file: ${configPath}`)
      config = JSON.parse(await readFile(configPath, 'utf8'))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const { inputs, args } = resolveConfig(config, variables)
    const paths = [...new Set([source, 'shared', 'packages', '.dockerignore',
      '.github/workflows/game-images.yml', 'scripts/game-images.mjs', ...inputs])].sort()
    const tree = checkedRun(runner, root, 'git', ['ls-tree', '-r', '-z', 'HEAD', '--', ...paths])
    const key = createHash('sha256').update(JSON.stringify({ schema: 1, platform, paths, args }))
      .update('\0').update(tree).digest('hex')
    const image = `ghcr.io/${normalizedRepository}-${entry.name}`
    builds.push({ id: entry.name, source, dockerfile, image, key, tag: `${image}:source-${key}`,
      buildArgs: Object.entries(args).map(([name, value]) => `${name}=${value}`).join('\n') })
  }
  return { include: builds }
}

export function validateBuild(build) {
  if (!object(build) || !identifier.test(build.id ?? '') ||
      build.source !== `games/${build.id}` || build.dockerfile !== `${build.source}/Dockerfile` ||
      typeof build.image !== 'string' || !build.image.startsWith('ghcr.io/') ||
      !repositoryPattern.test(build.image.slice('ghcr.io/'.length)) ||
      !build.image.endsWith(`-${build.id}`) || !/^[0-9a-f]{64}$/.test(build.key ?? '') ||
      build.tag !== `${build.image}:source-${build.key}`) {
    throw new Error('Invalid game image build')
  }
  return build
}

export function fingerprintFromImage(image) {
  const configuration = image?.config ? image : image?.[platform]
  return configuration?.config?.Labels?.[inputLabel]
}

export function imageReference(build, digest) {
  validateBuild(build)
  if (typeof digest !== 'string' || !digestPattern.test(digest)) throw new Error(`Invalid image digest for ${build.id}`)
  return `${build.image}@${digest}`
}

function validateReference(build, reference) {
  if (typeof reference !== 'string' || !reference.startsWith(`${build.image}@`) ||
      reference !== imageReference(build, reference.slice(build.image.length + 1))) {
    throw new Error(`Invalid resolved image for ${build.id}`)
  }
  return reference
}

function inspectImage(root, reference, runner, warn) {
  const result = runner('docker', ['buildx', 'imagetools', 'inspect', reference,
    '--format', '{"manifest":{{json .Manifest}},"image":{{json .Image}}}'], { cwd: root })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const message = result.stderr || result.stdout || `${result.signal || result.status}`
    // Before a GHCR package first exists it can report an authorization failure.
    // The subsequent build/push will surface a genuine permissions problem.
    if (/manifest unknown|manifest_unknown|name unknown|not found|no such manifest|unauthorized|denied:|403 forbidden/i.test(message)) {
      warn(`Cannot reuse ${reference}: ${message.trim()}`)
      return null
    }
    throw new Error(`Cannot inspect ${reference}: ${message.trim()}`)
  }
  const inspected = JSON.parse(result.stdout)
  if (!object(inspected.manifest) || !object(inspected.image)) throw new Error(`Invalid registry response for ${reference}`)
  return inspected
}

export function checkBuild(build, { root = rootDirectory, force = false, runner = run, warn = console.warn } = {}) {
  validateBuild(build)
  if (force) return { build: true }
  for (const reference of [`${build.image}:latest`, build.tag]) {
    const inspected = inspectImage(root, reference, runner, warn)
    if (inspected && fingerprintFromImage(inspected.image) === build.key) {
      return { build: false, image: imageReference(build, inspected.manifest.digest) }
    }
  }
  return { build: true }
}

export async function recordBuild(build, { root = rootDirectory, resolvedImage, builtDigest, resultsDirectory,
  defaultBranch, ref, sha, runner = run } = {}) {
  validateBuild(build)
  const image = builtDigest ? imageReference(build, builtDigest) : validateReference(build, resolvedImage)
  if (!resultsDirectory) throw new Error('GAME_IMAGE_RESULTS is required')
  if (defaultBranch && ref === `refs/heads/${defaultBranch}`) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(defaultBranch) || !/^[0-9a-f]{40,64}$/.test(sha ?? '')) {
      throw new Error('Invalid default branch or GITHUB_SHA')
    }
    const head = checkedRun(runner, root, 'git', ['ls-remote', 'origin', `refs/heads/${defaultBranch}`])
      .trim().split(/\s+/)[0]
    if (!/^[0-9a-f]{40,64}$/.test(head)) throw new Error('Cannot resolve the current default-branch HEAD')
    if (head === sha) {
      checkedRun(runner, root, 'docker', ['buildx', 'imagetools', 'create', '--prefer-index=false',
        '--tag', `${build.image}:latest`, image])
    }
  }
  await mkdir(resultsDirectory, { recursive: true })
  await writeFile(path.join(resultsDirectory, `${build.id}.json`), JSON.stringify({ id: build.id, image }) + '\n')
  return { image }
}

export async function collectBuilds(matrix, resultsDirectory) {
  if (!object(matrix) || !Array.isArray(matrix.include)) throw new Error('Invalid game image matrix')
  const builds = matrix.include.map(validateBuild)
  const expected = new Map(builds.map((build) => [build.id, build]))
  if (expected.size !== builds.length) throw new Error('Duplicate game image builds')
  let files = []
  try {
    files = await readdir(resultsDirectory)
  } catch (error) {
    if (error.code !== 'ENOENT' || builds.length > 0) throw error
  }
  if (files.length !== builds.length || files.some((file) => !expected.has(file.replace(/\.json$/, '')) || !file.endsWith('.json'))) {
    throw new Error('Game image results do not match discovered games')
  }
  const images = {}
  for (const build of builds) {
    const result = JSON.parse(await readFile(path.join(resultsDirectory, `${build.id}.json`), 'utf8'))
    if (!object(result) || result.id !== build.id) throw new Error(`Invalid game image result for ${build.id}`)
    images[build.id] = validateReference(build, result.image)
  }
  return images
}

async function output(values) {
  const lines = Object.entries(values).map(([name, value]) => `${name}=${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n') + '\n'
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, lines)
  else process.stdout.write(lines)
}

async function main(command, env) {
  switch (command) {
    case 'discover': {
      const matrix = await discoverBuilds({ repository: env.GITHUB_REPOSITORY,
        variables: JSON.parse(env.GAME_IMAGE_VARIABLES || '{}') })
      return output({ matrix, has_games: matrix.include.length > 0 })
    }
    case 'check': {
      if (!['true', 'false', undefined, ''].includes(env.FORCE_REBUILD)) throw new Error('Invalid FORCE_REBUILD')
      return output(checkBuild(JSON.parse(env.GAME_IMAGE_BUILD), { force: env.FORCE_REBUILD === 'true' }))
    }
    case 'record':
      return output(await recordBuild(JSON.parse(env.GAME_IMAGE_BUILD), {
        resolvedImage: env.RESOLVED_IMAGE, builtDigest: env.BUILT_DIGEST, resultsDirectory: env.GAME_IMAGE_RESULTS,
        defaultBranch: env.DEFAULT_BRANCH, ref: env.GITHUB_REF, sha: env.GITHUB_SHA,
      }))
    case 'collect':
      return output({ images: await collectBuilds(JSON.parse(env.GAME_IMAGE_BUILDS), env.GAME_IMAGE_RESULTS) })
    default:
      throw new Error('Usage: node scripts/game-images.mjs discover|check|record|collect')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv[2], process.env)
}
