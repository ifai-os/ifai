import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "skills" ADD COLUMN "stats_installs_prev7d" numeric DEFAULT 0;
  ALTER TABLE "_skills_v" ADD COLUMN "version_stats_installs_prev7d" numeric DEFAULT 0;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "skills" DROP COLUMN "stats_installs_prev7d";
  ALTER TABLE "_skills_v" DROP COLUMN "version_stats_installs_prev7d";`)
}
