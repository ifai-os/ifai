/**
 * The `arena` instructions (docs/specs/rankings.md rule 6): the same words for every contestant,
 * so the answers differ by model and nothing else. The question itself is the site owner's own
 * text from the question bank and goes in as the prompt, unchanged. Changing these instructions
 * makes every answer due again (the receipts are keyed by them), so do it between seasons only.
 */
export const answerInstructions = `Answer the request below as well as you can.

- Reply in the language the request is written in.
- Do not mention your name, which model you are, or the company that made you, and do not sign the answer.
- Write plain text. Put any code in fenced code blocks (\`\`\`). Do not use other Markdown: no headings, tables, bold or links markup.
- Be as long as the request needs and no longer.`
