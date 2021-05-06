const gulp = require('gulp');
const path = require('path');
const fs = require('fs-extra');
const Ajv = require('ajv');
const through = require('through2');

const taskPaths = require('./taskPaths');
const validateProfile = require('../src/validateRegistryProfile');

/**
 * Validate the profile against the schema
 * @param {object} profileJson - the profile to validate
 */
function buildSchemaValidator() {
  const ajv = new Ajv();
  const schemasPath = path.join(taskPaths.toolsDest, taskPaths.schemasCombinedFilename);
  const schemas = fs.readJsonSync(schemasPath);
  schemas.dependencies.forEach((schema) => {
    ajv.addSchema(schema);
  });
  return ajv.compile(schemas.mainSchema);
}

function validate(schemaValidator) {
  return through.obj((vinylFile, encoding, callback) => {
    const profileJson = JSON.parse(vinylFile.contents.toString());

    // Validate the supplied profile conforms to schema
    if (!schemaValidator(profileJson)) {
      const errors = JSON.stringify(schemaValidator.errors, null, 2);
      throw new Error(`${profileJson.profileId} Failed to validate schema with errors: ${errors}`);
    }

    validateProfile(profileJson);

    callback(null, vinylFile);
  });
}

function mergeProfiles() {
  const schemaValidator = buildSchemaValidator();

  return gulp.src(taskPaths.profilesGlob)
    .pipe(validate(schemaValidator))
    .pipe(gulp.dest(taskPaths.profilesDest));
}

module.exports = mergeProfiles;
