import * as migration_20261022_112124_initial from './20261022_112124_initial';
import * as migration_20261022_152835_apps from './20261022_152835_apps';
import * as migration_20261022_160814_model_receipts_pgvector from './20261022_160814_model_receipts_pgvector';
import * as migration_20261022_161230_daily_sources_raw_items from './20261022_161230_daily_sources_raw_items';
import * as migration_20261022_163842_resources from './20261022_163842_resources';

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
    up: migration_20261022_160814_model_receipts_pgvector.up,
    down: migration_20261022_160814_model_receipts_pgvector.down,
    name: '20261022_160814_model_receipts_pgvector',
  },
  {
    up: migration_20261022_161230_daily_sources_raw_items.up,
    down: migration_20261022_161230_daily_sources_raw_items.down,
    name: '20261022_161230_daily_sources_raw_items',
  },
  {
    up: migration_20261022_163842_resources.up,
    down: migration_20261022_163842_resources.down,
    name: '20261022_163842_resources'
  },
];
