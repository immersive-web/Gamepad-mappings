const gulp = require('gulp');
const path = require('path');
const jsonCombine = require('gulp-jsoncombine');

const taskPaths = require('./taskPaths');

const mainSchemaFilename = 'profile.schema.json';

function combineSchemas(input) {
  const mainSchemaKey = path.basename(mainSchemaFilename, '.json');
  const mainSchema = input[mainSchemaKey];
  const dependencies = [];
  Object.keys(input).forEach((key) => {
    if (key !== mainSchemaKey) {
      dependencies.push(input[key]);
    }
  });

  const schemas = {
    mainSchema,
    dependencies
  };
  return Buffer.from(JSON.stringify(schemas, null, 2));
}

function copySchemas() {
  const srcGlob = taskPaths.schemasGlob;
  return gulp.src(srcGlob)
    .pipe(gulp.dest(taskPaths.schemasDest))
    .pipe(jsonCombine(taskPaths.schemasCombinedFilename, combineSchemas))
    .pipe(gulp.dest(taskPaths.toolsDest));
}

module.exports = copySchemas;
