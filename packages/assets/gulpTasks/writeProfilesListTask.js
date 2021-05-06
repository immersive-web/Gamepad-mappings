const path = require('path');
const fs = require('fs-extra');
const glob = require('glob');

const optionalRequire = require('optional-require')(require);

const taskPaths = require('./taskPaths');

const registryModulePath = optionalRequire.resolve('@webxr-input-profiles/registry', '');
const profilesListDest = path.join(taskPaths.profilesDest, 'profilesList.json');

function generate() {
  return new Promise((resolve, reject) => {
    const profilesList = {};
    glob(taskPaths.profilesGlob, null, (error, files) => {
      if (error) {
        reject(error);
      } else {
        files.forEach((file) => {
          const profileId = path.basename(path.dirname(file));
          const relativePath = file.substr((taskPaths.profilesSrc.length) + 1);
          profilesList[profileId] = { path: relativePath };

          // If there are any deprecated profile ids listed in the registry file,
          // list them as pointing to the same path as the standard profile id.
          const vendorId = profileId.split('-', 1)[0];
          const registryFolder = path.join(path.dirname(registryModulePath), 'profiles');
          const registryJson = fs.readJsonSync(path.join(registryFolder, vendorId, `${profileId}.json`));
          if (registryJson.deprecatedProfileIds) {
            registryJson.deprecatedProfileIds.forEach((deprecatedId) => {
              profilesList[deprecatedId] = {
                path: relativePath,
                deprecated: true
              };
            });
          }
        });

        resolve(profilesList);
      }
    });
  });
}

function writeProfilesList() {
  return generate().then((profilesList) => {
    fs.outputJson(profilesListDest, profilesList, { spaces: 2 });
  });
}

module.exports = writeProfilesList;
