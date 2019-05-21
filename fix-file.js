const ora = require('ora')
const fs = require('fs-extra')
const path = require('path')
const {exec} = require('./exec')

let file = process.argv[2]
const logs = {stderr: '', stdout: ''}

if (!file) {
  ora('Missing file argument').fail()
  process.exit(1)
}

if (!path.isAbsolute(file)) {
  file = path.join(process.cwd(), file)
}

if (!fs.existsSync(file)) {
  ora(`Cannot find Sketch file at ${file}`).fail()
  process.exit(1)
}

if (path.extname(file) !== '.sketch') {
  ora(`${file} doesn't look like a sketch file`).fail()
  process.exit(1)
}

const corruptedFile = file.replace(/\.sketch$/g, '.corrupted.sketch')

const tempFolder = fs.mkdtempSync((Math.random() * 1000000).toFixed(0))
const zipFile = path.join(tempFolder, path.basename(file, '.sketch') + '.zip')
const zipFolder = path.join(tempFolder, path.basename(file, '.sketch'))

const spinner = ora(`Renaming ${file} to ${corruptedFile}`).start()

fs.rename(file, corruptedFile).then(() => {
  spinner.succeed(`Renamed ${file} to ${corruptedFile}`)
  return fs.stat(corruptedFile)
}).then(stat => {
  if (stat.isDirectory()) {
    logs.stderr += '\n\n-----------------\n\n'
    logs.stdout += 'It\'s a folder with a `.sketch` extension at the end\n\n-----------------\n\n'
    return fs.copy(corruptedFile, zipFolder, {recursive: true})
  }

  spinner.text = 'Fixing the archive'

  return exec(`yes | zip -FF "${corruptedFile}" --out="${zipFile}"`).then(({stderr, stdout}) => {
    logs.stderr += stderr + '\n\n-----------------\n\n'
    logs.stdout += stdout + '\n\n-----------------\n\n'

    spinner.succeed('Fixed the archive')
    spinner.text = "Unzipping the archive"

    return exec(`unzip "${zipFile}" -d "${zipFolder}"`).catch(err => {
      // we know it's going to failed but if we managed to create a folder,
      // then we are just going to continue
      if (fs.existsSync(zipFolder)) {
        return {stdout: err.stdout, stderr: err.stderr}
      }
      throw err
    })
  }).then(({stderr, stdout}) => {
    logs.stderr += stderr + '\n\n-----------------\n\n'
    logs.stdout += stdout + '\n\n-----------------\n\n'

    spinner.succeed("Unzipped the archive")
  })
}).then(() => {
  spinner.text = "Looking for missing files and adding them back if possible"

  return Promise.all([
    fs.exists(path.join(zipFolder, 'document.json')).then(exists => {
      if (!exists) {
        logs.stderr += 'document.json missing'
        throw new Error('The file is missing the document.json. Cannot fix that sorry.')
      }
    }),
    fs.exists(path.join(zipFolder, 'meta.json')).then(exists => {
      if (!exists) {
        logs.stdout += '!! meta.json missing. Adding it back\n'
        return fs.writeFile(path.join(zipFolder, 'meta.json'), JSON.stringify(require('./fixtures/meta.json')))
          .then(() => {
            spinner.succeed("Added meta.json file")
          })
      }
    }),
    fs.exists(path.join(zipFolder, 'user.json')).then(exists => {
      if (!exists) {
        logs.stdout += '!! user.json missing. Adding it back\n'
        return fs.writeFile(path.join(zipFolder, 'user.json'), JSON.stringify(require('./fixtures/user.json')))
          .then(() => spinner.succeed("Added user.json file"))
      }
    })
  ])
}).then(() => {
  logs.stdout += '\n-----------------\n\n'

  spinner.succeed("Did what we can to fix the file")
  spinner.text = "Building the new Sketch file"
  return exec(`cd "${zipFolder}" && zip -r "${file}" .`)
}).then(({stderr, stdout}) => {
  logs.stderr += stderr + '\n\n-----------------\n\n'
  logs.stdout += stdout + '\n\n-----------------\n\n'

  spinner.succeed("Built the new Sketch file")
  spinner.stop()

  fs.removeSync(tempFolder)
}).catch(err => {
  fs.removeSync(tempFolder)

  spinner.fail("Something bad happened. Please open an issue here https://github.com/BohemianCoding/fix-sketch-file/issues/new.")
  spinner.stop()

  console.log(logs)
  console.error(err)

  process.exit(1)
})
