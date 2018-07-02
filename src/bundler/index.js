const Bundler = require('parcel-bundler')
const template = require('lodash/template')
const { join, resolve } = require('path')
const { existsSync, mkdirSync, readFileSync, ensureDir, copySync } = require('fs-extra')

const {
  resolveApp,
  resolveOwn,
  getAndVerifySrcPath,
  separatePathSources,
  transferFile,
  resolveFile
} = require('./utils')

const { 
  SERVER,
  CLIENT,
  ROGUE_DIR,
  TMP_DIR,
  CACHE_DIR,
  BUILD_DIR, 
  BUILD_PUBLIC_DIR,
  BUILD_FILE,
  CONFIG_FILE
} = require('./constants')

const isProd = process.env.NODE_ENV === 'production'

const getBundleOptions = env => ({
  target: env === SERVER ? 'node' : 'browser',
  outDir: env === SERVER ? BUILD_DIR : BUILD_PUBLIC_DIR,
  outFile: BUILD_FILE,
  publicUrl: BUILD_PUBLIC_DIR, // ?
  // on client we disabled watch because we will be serving app oursevles and Parcel
  // includes a process.env.HMR_HOSTNAME variable in bundle if watch mode is enabled
  // (we configure HRM for the client bundle in the rogue scripts)
  watch: !isProd && env === SERVER,
  cache: !isProd,
  cacheDir: env === SERVER ? `${CACHE_DIR}/server` : `${CACHE_DIR}/client`,
  minify: isProd,
  sourceMaps: isProd,
  hmrHostname: SERVER ? 'server-bundle' : 'client-bundle',
  hmrPort: 0,
  logLevel: 3,
  detailedReport: isProd
})


function prepBuild () {
  // create build dirs
  ensureDir(ROGUE_DIR)
  ensureDir(TMP_DIR)

  // copy over public assets
  copySync(resolveApp('public'), resolveApp(BUILD_PUBLIC_DIR), {
    dereference: true,
  })
}

module.exports = function bundler (env) {
  prepBuild()

  const srcPath = getAndVerifySrcPath(['App', 'src/App'])
  const { srcDir, srcFile } = separatePathSources(srcPath)

  const fromRootToSrc = (path) => './' + join(srcDir, path).replace(/\\/g, '/')
  const fromRootToRogue = (path) => './' + join(`${TMP_DIR}`, path).replace(/\\/g, '/')
  const fromRogueToSrc = (path) =>  '../../' + join(srcDir, path).replace(/\\/g, '/')

  // Check if user has certain file, otherwise use its template.
  // Returns either the target or backup file path.
  const getOrMakeFile = (targetFile, processTransfer = null) => {
    const targetPath = resolveFile(join(srcDir, targetFile))
    // we leave file ext open to user but make sure to return full file name for Parcel
    // otherwise the bundler outFile name doesn't seem to be used 
    if (targetPath) return fromRootToSrc(targetPath)

    const templatePath = resolveOwn(`src/templates/${targetFile}.js`)
    const backupPath = resolveApp(`${TMP_DIR}/${targetFile}.js`)
    transferFile(templatePath, backupPath, processTransfer)
    return fromRootToRogue(`${targetFile}.js`)
  }

  const appPath = fromRogueToSrc(srcFile)
  const appFile = readFileSync(srcPath, 'utf8')

  let entryPath
  if (env === SERVER) {
    const templateVars = { 
      appPath,
      css: {
        emotion: appFile.indexOf('rogue/hocs/emotion') > -1,
        styledComponents: appFile.indexOf('rogue/hocs/styled-components') > -1
      }
    }
    entryPath = getOrMakeFile('server', file => {
      return template(file)(templateVars)
    })
  } else if (env === CLIENT) {
    const templateVars = {
      appPath
    }
    entryPath = getOrMakeFile('client', (file) => {
      return template(file)(templateVars)
    })
  }

  return new Bundler(entryPath, getBundleOptions(env))
}
