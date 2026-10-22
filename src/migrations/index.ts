import * as migration_20261022_112124_initial from './20261022_112124_initial';
import * as migration_20261022_152835_apps from './20261022_152835_apps';
import * as migration_20261022_161718_resources from './20261022_161718_resources';

export const migrations = [
  {
    up: migration_20261022_112124_initial.up,
    down: migration_20261022_112124_initial.down,
    name: '20261022_112124_initial',
  },
  {
    up: migration_20261022_152835_apps.up,
    down: migration_20261022_152835_apps.down,
    name: '20261022_152835_apps',
  },
  {
    up: migration_20261022_161718_resources.up,
    down: migration_20261022_161718_resources.down,
    name: '20261022_161718_resources'
  },
];
