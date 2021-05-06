const path = require('path');
const fs = require('fs-extra');
const glob = require('glob');

const taskPaths = require('./taskPaths');

function generate() {
  return new Promise((resolve, reject) => {
    const profilesList = {};
    glob(taskPaths.profilesGlob, null, (error, files) => {
      if (error) {
        reject(error);
      } else {
        files.forEach((file) => {
          const profileId = path.basename(file, '.json');
          const relativePath = file.substr((taskPaths.profilesSrc.length) + 1);
          profilesList[profileId] = { path: relativePath };

          // If there are any deprecated profile ids listed in the file, list
          // them as pointing to the same path as the standard profile id.
          const profileJson = fs.readJsonSync(file);
          if (profileJson.deprecatedProfileIds) {
            profileJson.deprecatedProfileIds.forEach((deprecatedId) => {
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
    fs.outputJsonSync(taskPaths.profilesListDest, profilesList, { spaces: 2 });
  });
}

module.exports = writeProfilesList;
