const childProcess = require('child_process')

module.exports.exec = function exec(command, options) {
  return new Promise((resolve, reject) => {
    childProcess.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        return reject(error)
      }
      return resolve({
        stdout,
        stderr,
      })
    })
  })
}
