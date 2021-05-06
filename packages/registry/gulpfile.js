const gulp = require('gulp');
const fs = require('fs-extra');

const taskPaths = require('./gulpTasks/taskPaths');
const validateProfiles = require('./gulpTasks/validateProfilesTask');
const copySchemas = require('./gulpTasks/copySchemasTask');
const copyTools = require('./gulpTasks/copyToolsTask');
const writeProfilesList = require('./gulpTasks/writeProfilesListTask');

function clean() {
  return fs.remove(taskPaths.dest);
}

const build = gulp.series(
  copySchemas,
  validateProfiles,
  gulp.parallel(copyTools, writeProfilesList)
);

const cleanBuild = gulp.series(clean, build);

function watchBuild() {
  return gulp.watch(taskPaths.watchGlobs, { ignoreInitial: false }, cleanBuild);
}

exports.clean = clean;
exports.build = build;
exports.cleanBuild = cleanBuild;
exports.watch = watchBuild;

exports.default = cleanBuild;
