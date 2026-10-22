import * as migration_20261022_112124_initial from './20261022_112124_initial';
import * as migration_20261022_142101_model_receipts_pgvector from './20261022_142101_model_receipts_pgvector';

export const migrations = [
  {
    up: migration_20261022_112124_initial.up,
    down: migration_20261022_112124_initial.down,
    name: '20261022_112124_initial',
  },
  {
    up: migration_20261022_142101_model_receipts_pgvector.up,
    down: migration_20261022_142101_model_receipts_pgvector.down,
    name: '20261022_142101_model_receipts_pgvector'
  },
];
