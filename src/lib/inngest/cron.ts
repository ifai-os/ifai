/**
 * A cron trigger that exists only while the switch its job checks first is on. With the switch
 * off the job would start on schedule only to return "skipped", so the schedule is left out and
 * the job keeps just its event (the sweep can still be sent by hand). Switches are read when the
 * app registers its functions, which happens on every deploy: a changed switch takes effect with
 * the next deploy, as every Vercel environment variable does.
 */
export function cronWhen(on: boolean, cron: string): { cron: string }[] {
  return on ? [{ cron }] : []
}
