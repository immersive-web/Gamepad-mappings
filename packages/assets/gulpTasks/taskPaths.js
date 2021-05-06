const path = require('path');

const taskPaths = {};

taskPaths.dest = path.join(__dirname, '../dist');

taskPaths.profilesSrc = path.join(__dirname, '../profiles');
taskPaths.profilesGlob = path.join(taskPaths.profilesSrc, '**/profile.json');
taskPaths.profilesDest = path.join(taskPaths.dest, 'profiles');

taskPaths.assetsGlob = ['profiles/**', `!${taskPaths.profilesGlob}`];
taskPaths.assetsDest = taskPaths.profilesDest;

taskPaths.schemasSrc = path.join(__dirname, '../schemas');
taskPaths.schemasGlob = path.join(taskPaths.schemasSrc, '**');
taskPaths.schemasDest = path.join(taskPaths.dest, 'schemas');
taskPaths.schemasCombinedFilename = 'assetSchemas.json';

taskPaths.toolsSrc = path.join(__dirname, '../src');
taskPaths.toolsGlob = path.join(taskPaths.toolsSrc, '*.js');
taskPaths.toolsDest = path.join(taskPaths.dest, 'profilesTools');

taskPaths.watchGlobs = [taskPaths.profilesGlob, taskPaths.schemasGlob];

module.exports = taskPaths;
