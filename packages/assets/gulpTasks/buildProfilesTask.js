const gulp = require('gulp');
const path = require('path');
const fs = require('fs-extra');
const Ajv = require('ajv');
const through = require('through2');

const optionalRequire = require('optional-require')(require);

const registryModulePath = optionalRequire.resolve('@webxr-input-profiles/registry', '');

const taskPaths = require('./taskPaths');
const expandRegistryProfile = require('../src/expandRegistryProfile');
const buildAssetProfile = require('../src/buildAssetProfile');

/**
 * Validate the profile against the schema
 * @param {object} profileJson - the profile to validate
 */
function buildValidator() {
  const ajv = new Ajv();
  const schemasPath = path.join(taskPaths.toolsDest, taskPaths.schemasCombinedFilename);
  const schemas = fs.readJsonSync(schemasPath);
  schemas.dependencies.forEach((schema) => {
    ajv.addSchema(schema);
  });
  return ajv.compile(schemas.mainSchema);
}

function validateAssetInfo(schemaValidator) {
  return through.obj((vinylFile, encoding, callback) => {
    const assetInfo = JSON.parse(vinylFile.contents.toString());

    // Validate the supplied profile
    if (!schemaValidator(assetInfo)) {
      const errors = JSON.stringify(schemaValidator.errors, null, 2);
      throw new Error(`${assetInfo.id} Failed to validate schema with errors: ${errors}`);
    }

    callback(null, vinylFile);
  });
}

function buildProfile() {
  return through.obj((vinylFile, encoding, callback) => {
    const profileId = path.basename(vinylFile.dirname);
    const vendorId = profileId.split('-', 1)[0];

    // Get the matching file from the registry
    const registryFolder = path.join(path.dirname(registryModulePath), 'profiles');
    const registryJson = fs.readJsonSync(path.join(registryFolder, vendorId, `${profileId}.json`));
    const expandedRegistryProfile = expandRegistryProfile(registryJson);

    const assetInfo = JSON.parse(vinylFile.contents.toString());
    const assetProfile = buildAssetProfile(assetInfo, expandedRegistryProfile);
    const outputFile = vinylFile.clone();
    outputFile.contents = Buffer.from(JSON.stringify(assetProfile, null, 2));

    callback(null, outputFile);
  });
}

function buildProfilesTask() {
  const schemaValidator = buildValidator();

  return gulp.src(taskPaths.profilesGlob)
    .pipe(validateAssetInfo(schemaValidator))
    .pipe(buildProfile())
    .pipe(gulp.dest(taskPaths.profilesDest));
}

module.exports = buildProfilesTask;
