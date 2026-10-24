import * as migration_20261022_112124_initial from './20261022_112124_initial';
import * as migration_20261022_152835_apps from './20261022_152835_apps';
import * as migration_20261022_160814_model_receipts_pgvector from './20261022_160814_model_receipts_pgvector';
import * as migration_20261022_161230_daily_sources_raw_items from './20261022_161230_daily_sources_raw_items';
import * as migration_20261022_161537_daily_judge_stories from './20261022_161537_daily_judge_stories';
import * as migration_20261022_164805_resources from './20261022_164805_resources';
import * as migration_20261022_203732_daily_review from './20261022_203732_daily_review';
import * as migration_20261022_205617_apps_profile_drafts from './20261022_205617_apps_profile_drafts';
import * as migration_20261022_210445_resources_import from './20261022_210445_resources_import';
import * as migration_20261022_212738_apps_heat from './20261022_212738_apps_heat';
import * as migration_20261022_215046_resources_describe from './20261022_215046_resources_describe';
import * as migration_20261023_020510_daily_heat from './20261023_020510_daily_heat';
import * as migration_20261023_023543_saves from './20261023_023543_saves';
import * as migration_20261023_030415_daily_posters from './20261023_030415_daily_posters';
import * as migration_20261023_033517_app_reviews from './20261023_033517_app_reviews';
import * as migration_20261023_042731_skills_stats_prev_week from './20261023_042731_skills_stats_prev_week';
import * as migration_20261023_063112_review_translations from './20261023_063112_review_translations';
import * as migration_20261023_064437_skill_submissions_notify from './20261023_064437_skill_submissions_notify';
import * as migration_20261023_070059_daily_email_subscribers from './20261023_070059_daily_email_subscribers';
import * as migration_20261023_073510_app_reports from './20261023_073510_app_reports';
import * as migration_20261023_082050_daily_email_sends from './20261023_082050_daily_email_sends';
import * as migration_20261023_084701_app_submissions from './20261023_084701_app_submissions';
import * as migration_20261024_041525_admin_log from './20261024_041525_admin_log';
import * as migration_20261024_180123_rankings from './20261024_180123_rankings';

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
    up: migration_20261022_161537_daily_judge_stories.up,
    down: migration_20261022_161537_daily_judge_stories.down,
    name: '20261022_161537_daily_judge_stories',
  },
  {
    up: migration_20261022_164805_resources.up,
    down: migration_20261022_164805_resources.down,
    name: '20261022_164805_resources',
  },
  {
    up: migration_20261022_203732_daily_review.up,
    down: migration_20261022_203732_daily_review.down,
    name: '20261022_203732_daily_review',
  },
  {
    up: migration_20261022_205617_apps_profile_drafts.up,
    down: migration_20261022_205617_apps_profile_drafts.down,
    name: '20261022_205617_apps_profile_drafts',
  },
  {
    up: migration_20261022_210445_resources_import.up,
    down: migration_20261022_210445_resources_import.down,
    name: '20261022_210445_resources_import',
  },
  {
    up: migration_20261022_212738_apps_heat.up,
    down: migration_20261022_212738_apps_heat.down,
    name: '20261022_212738_apps_heat',
  },
  {
    up: migration_20261022_215046_resources_describe.up,
    down: migration_20261022_215046_resources_describe.down,
    name: '20261022_215046_resources_describe',
  },
  {
    up: migration_20261023_020510_daily_heat.up,
    down: migration_20261023_020510_daily_heat.down,
    name: '20261023_020510_daily_heat',
  },
  {
    up: migration_20261023_023543_saves.up,
    down: migration_20261023_023543_saves.down,
    name: '20261023_023543_saves',
  },
  {
    up: migration_20261023_030415_daily_posters.up,
    down: migration_20261023_030415_daily_posters.down,
    name: '20261023_030415_daily_posters',
  },
  {
    up: migration_20261023_033517_app_reviews.up,
    down: migration_20261023_033517_app_reviews.down,
    name: '20261023_033517_app_reviews',
  },
  {
    up: migration_20261023_042731_skills_stats_prev_week.up,
    down: migration_20261023_042731_skills_stats_prev_week.down,
    name: '20261023_042731_skills_stats_prev_week',
  },
  {
    up: migration_20261023_063112_review_translations.up,
    down: migration_20261023_063112_review_translations.down,
    name: '20261023_063112_review_translations',
  },
  {
    up: migration_20261023_064437_skill_submissions_notify.up,
    down: migration_20261023_064437_skill_submissions_notify.down,
    name: '20261023_064437_skill_submissions_notify',
  },
  {
    up: migration_20261023_070059_daily_email_subscribers.up,
    down: migration_20261023_070059_daily_email_subscribers.down,
    name: '20261023_070059_daily_email_subscribers',
  },
  {
    up: migration_20261023_073510_app_reports.up,
    down: migration_20261023_073510_app_reports.down,
    name: '20261023_073510_app_reports',
  },
  {
    up: migration_20261023_082050_daily_email_sends.up,
    down: migration_20261023_082050_daily_email_sends.down,
    name: '20261023_082050_daily_email_sends',
  },
  {
    up: migration_20261023_084701_app_submissions.up,
    down: migration_20261023_084701_app_submissions.down,
    name: '20261023_084701_app_submissions',
  },
  {
    up: migration_20261024_041525_admin_log.up,
    down: migration_20261024_041525_admin_log.down,
    name: '20261024_041525_admin_log',
  },
  {
    up: migration_20261024_180123_rankings.up,
    down: migration_20261024_180123_rankings.down,
    name: '20261024_180123_rankings'
  },
];
